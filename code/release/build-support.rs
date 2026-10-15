use std::{env, fs, path::Path};
use trace_kernel_mcp_protocol::{valid_generation, ProductIdentity};

pub fn generation_constant(source: &str, name: &str) -> Result<String, String> {
    let mut values = Vec::new();
    for line in source.lines() {
        let Some((left, right)) = line.trim().split_once('=') else {
            continue;
        };
        if left.split_whitespace().collect::<Vec<_>>() == ["export", "const", name] {
            // The shared source is authoritative. Refuse expressions or stale copies.
            let value: String =
                serde_json::from_str(right.trim().trim_end_matches(';')).map_err(|_| {
                    format!("{name} must remain a JSON string literal in gen-version.js")
                })?;
            if !valid_generation(&value) {
                return Err(format!("Invalid {name}"));
            }
            values.push(value);
        }
    }
    if values.len() != 1 {
        return Err(format!("Expected exactly one {name} in gen-version.js"));
    }
    Ok(values.remove(0))
}

pub fn load_identity(root: &Path) -> Result<ProductIdentity, String> {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase", deny_unknown_fields)]
    struct Release {
        format_version: u32,
        release_version: String,
        bridge_protocol_gen: u32,
    }
    let release: Release = serde_json::from_slice(
        &fs::read(root.join("release/desktop-mcp.json")).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    if release.format_version != 1 {
        return Err("Unknown release metadata format".into());
    }
    let generations =
        fs::read_to_string(root.join("packages/runtime-core/src/metadata/gen-version.js"))
            .map_err(|e| e.to_string())?;
    let identity = ProductIdentity {
        release_version: release.release_version,
        bridge_protocol_gen: release.bridge_protocol_gen,
        api_gen: generation_constant(&generations, "API_GEN")?,
        workspace_gen: generation_constant(&generations, "WORKSPACE_GEN")?,
    };
    identity.validate().map_err(|e| e.to_string())?;
    Ok(identity)
}

pub fn verify_version(
    expected: &ProductIdentity,
    actual: &str,
    origin: &str,
) -> Result<(), String> {
    if expected.release_version != actual {
        return Err(format!(
            "{origin} version {actual} differs from desktop-mcp.json {}",
            expected.release_version
        ));
    }
    Ok(())
}

pub fn verify_frontend(expected: &ProductIdentity, bytes: &[u8]) -> Result<(), String> {
    let actual: ProductIdentity = serde_json::from_slice(bytes).map_err(|e| e.to_string())?;
    actual.validate().map_err(|e| e.to_string())?;
    if &actual != expected {
        return Err("Stale Frontend identity. Rebuild Desktop with npm run build".into());
    }
    Ok(())
}

#[cfg_attr(test, allow(dead_code))]
pub fn configure(root: &Path, desktop: bool) {
    for input in [
        "release/desktop-mcp.json",
        "release/build-support.rs",
        "packages/runtime-core/src/metadata/gen-version.js",
    ] {
        println!("cargo:rerun-if-changed={}", root.join(input).display());
    }
    println!("cargo:rerun-if-changed=Cargo.toml");
    let identity = load_identity(root).expect("Invalid Desktop/MCP release metadata");
    verify_version(
        &identity,
        &env::var("CARGO_PKG_VERSION").unwrap(),
        "Cargo package",
    )
    .unwrap();
    if desktop {
        for input in [
            "apps/desktop/package.json",
            "apps/desktop/package-lock.json",
            "apps/desktop/src-tauri/tauri.conf.json",
        ] {
            let path = root.join(input);
            println!("cargo:rerun-if-changed={}", path.display());
            let value: serde_json::Value =
                serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
            verify_version(
                &identity,
                value["version"].as_str().expect("Missing Desktop version"),
                input,
            )
            .unwrap();
            if input.ends_with("package-lock.json") {
                verify_version(
                    &identity,
                    value["packages"][""]["version"]
                        .as_str()
                        .expect("Missing locked Desktop version"),
                    input,
                )
                .unwrap();
            }
        }
        let frontend = root.join("apps/desktop/build/product-identity.json");
        println!("cargo:rerun-if-changed={}", frontend.display());
        if env::var("PROFILE").as_deref() == Ok("release") {
            verify_frontend(
                &identity,
                &fs::read(frontend).expect("Build Desktop Frontend first: npm run build"),
            )
            .unwrap();
        }
    }
    let output = std::path::PathBuf::from(env::var_os("OUT_DIR").unwrap()).join("desktop-mcp.json");
    fs::write(output, serde_json::to_vec(&identity).unwrap()).unwrap();
}

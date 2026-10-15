use sha2::{Digest, Sha256};
use std::{fs, path::PathBuf};

fn main() {
    let assets = PathBuf::from("../../packages/runtime-core/generated/runtime-assets");
    let manifest_path = assets.join("manifest.json");
    println!("cargo:rerun-if-changed={}", manifest_path.display());
    let manifest: serde_json::Value = serde_json::from_slice(&fs::read(&manifest_path).expect(
        "Build shared assets first: npm --prefix code/packages/runtime-core run build:assets",
    ))
    .expect("Invalid asset manifest");
    assert_eq!(manifest["formatVersion"], 1);
    for name in ["runtime.js", "compiler.js", "typescript-libs.json"] {
        let file = assets.join(name);
        println!("cargo:rerun-if-changed={}", file.display());
        let bytes = fs::read(file).expect("Missing shared asset");
        assert_eq!(
            manifest["assets"][name]["bytes"].as_u64(),
            Some(bytes.len() as u64)
        );
        assert_eq!(
            manifest["assets"][name]["sha256"].as_str(),
            Some(format!("{:x}", Sha256::digest(&bytes)).as_str())
        );
    }
    for field in ["workspace", "api"] {
        let value = manifest["generation"][field]
            .as_str()
            .expect("Asset generation metadata missing");
        println!("cargo:rustc-env=CLI_{}_GEN={value}", field.to_uppercase());
    }
}

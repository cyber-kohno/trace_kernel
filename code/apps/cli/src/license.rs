use std::{
    fs,
    path::{Path, PathBuf},
};

pub fn desktop_path() -> Option<PathBuf> {
    dirs::data_dir().map(|p| p.join("jp.hkdev.tk").join("license.json"))
}
pub fn load(explicit: Option<&Path>, desktop: Option<&Path>) -> Result<Option<String>, String> {
    let Some(path) = explicit.or(desktop) else {
        return Ok(None);
    };
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound && explicit.is_none() => {
            return Ok(None)
        }
        Err(error) => {
            return Err(format!(
                "Cannot read license file {}: {error}",
                path.display()
            ))
        }
    };
    let object: serde_json::Value = serde_json::from_slice(&bytes)
        .map_err(|_| format!("Invalid license JSON: {}", path.display()))?;
    // An empty Desktop store is the normal unregistered state.
    if explicit.is_none()
        && object.is_object()
        && object
            .get("key")
            .is_none_or(|key| key.is_null() || key.as_str() == Some(""))
    {
        return Ok(None);
    }
    let key = object
        .get("key")
        .and_then(|v| v.as_str())
        .filter(|key| !key.is_empty())
        .ok_or_else(|| format!("Missing or invalid license key: {}", path.display()))?;
    Ok(Some(key.into()))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn explicit_failure_never_falls_back() {
        let p = std::env::temp_dir().join(format!("tk-license-missing-{}", std::process::id()));
        assert!(load(Some(&p), None).is_err());
        assert!(load(None, Some(&p)).unwrap().is_none());
    }
    #[test]
    fn saved_desktop_key_explicit_priority_and_read_only_failures() {
        let prefix = std::env::temp_dir().join(format!(
            "tk-cli-license-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let desktop = prefix.with_extension("desktop.json");
        let explicit = prefix.with_extension("explicit.json");
        fs::write(&desktop, r#"{"key":"desktop-key"}"#).unwrap();
        fs::write(&explicit, r#"{"key":"explicit-key"}"#).unwrap();
        assert_eq!(
            load(None, Some(&desktop)).unwrap().as_deref(),
            Some("desktop-key")
        );
        assert_eq!(
            load(Some(&explicit), Some(&desktop)).unwrap().as_deref(),
            Some("explicit-key")
        );
        fs::write(&explicit, "{").unwrap();
        assert!(load(Some(&explicit), Some(&desktop)).is_err());
        assert_eq!(fs::read_to_string(&explicit).unwrap(), "{");
        for content in ["{}", r#"{"key":null}"#, r#"{"key":""}"#] {
            fs::write(&desktop, content).unwrap();
            assert!(load(None, Some(&desktop)).unwrap().is_none());
            assert!(load(Some(&desktop), None).is_err());
        }
        fs::write(&desktop, r#"{"key":123}"#).unwrap();
        assert!(load(None, Some(&desktop)).is_err());
        fs::remove_file(desktop).unwrap();
        fs::remove_file(explicit).unwrap();
    }
}

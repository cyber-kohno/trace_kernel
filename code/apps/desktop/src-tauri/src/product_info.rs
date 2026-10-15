use trace_kernel_mcp_protocol::ProductIdentity;

#[tauri::command]
pub fn get_product_info() -> ProductIdentity {
    serde_json::from_str(include_str!(concat!(env!("OUT_DIR"), "/desktop-mcp.json")))
        .expect("Product identity was validated at build time")
}

#[cfg(test)]
mod tests {
    #[test]
    fn compiled_identity_matches_the_desktop_package() {
        let identity = super::get_product_info();
        identity.validate().unwrap();
        assert_eq!(identity.release_version, env!("CARGO_PKG_VERSION"));
    }
}

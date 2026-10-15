use trace_kernel_mcp_protocol::ProductIdentity;

pub fn identity() -> ProductIdentity {
    serde_json::from_str(include_str!(concat!(env!("OUT_DIR"), "/desktop-mcp.json")))
        .expect("Product identity was validated at build time")
}

#[cfg(test)]
mod tests {
    #[test]
    fn compiled_identity_matches_the_mcp_package() {
        let identity = super::identity();
        identity.validate().unwrap();
        assert_eq!(identity.release_version, env!("CARGO_PKG_VERSION"));
    }
}

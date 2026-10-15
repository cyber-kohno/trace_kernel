#[path = "../../../release/build-support.rs"]
mod build_support;

#[test]
fn shared_generation_literals_are_read_without_node_or_a_second_definition() {
    for value in ["0", "1", "42"] {
        assert_eq!(
            build_support::generation_constant(
                &format!("export const API_GEN = \"{value}\";"),
                "API_GEN"
            )
            .unwrap(),
            value
        );
    }
    for source in [
        "",
        "export const API_GEN = 1;",
        "export const API_GEN = \"01\";",
        "export const API_GEN = String(1);",
        "export const API_GEN = \"1\";\nexport const API_GEN = \"2\";",
    ] {
        assert!(build_support::generation_constant(source, "API_GEN").is_err());
    }
}

#[test]
fn checked_in_release_matches_shared_generations_and_refuses_version_drift() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let identity = build_support::load_identity(&root).unwrap();
    assert_eq!(identity.release_version, "0.2.0");
    assert_eq!(identity.api_gen, "1");
    assert_eq!(identity.workspace_gen, "0");
    assert!(build_support::verify_version(&identity, "0.2.0", "fixture").is_ok());
    assert!(build_support::verify_version(&identity, "0.1.0", "fixture").is_err());
}

#[test]
fn stale_or_missing_frontend_identity_cannot_be_embedded_in_a_release() {
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let identity = build_support::load_identity(&root).unwrap();
    assert!(
        build_support::verify_frontend(&identity, &serde_json::to_vec(&identity).unwrap()).is_ok()
    );
    assert!(build_support::verify_frontend(&identity, b"{}").is_err());
    assert!(build_support::verify_frontend(&identity, b"").is_err());
    let mut stale = identity.clone();
    stale.release_version = "0.1.0".into();
    assert!(
        build_support::verify_frontend(&identity, &serde_json::to_vec(&stale).unwrap()).is_err()
    );
    stale = identity.clone();
    stale.bridge_protocol_gen += 1;
    assert!(
        build_support::verify_frontend(&identity, &serde_json::to_vec(&stale).unwrap()).is_err()
    );
    stale = identity.clone();
    stale.api_gen = "2".into();
    assert!(
        build_support::verify_frontend(&identity, &serde_json::to_vec(&stale).unwrap()).is_err()
    );
    stale = identity.clone();
    stale.workspace_gen = "2".into();
    assert!(
        build_support::verify_frontend(&identity, &serde_json::to_vec(&stale).unwrap()).is_err()
    );
}

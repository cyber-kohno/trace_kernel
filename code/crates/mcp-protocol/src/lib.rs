//! Host-independent Desktop/MCP identity and compatibility contract.
//! No transport, application state, filesystem or execution dependencies.
use serde::{Deserialize, Serialize};
use std::fmt;

/// Diagnostic/build information. Only bridge_contract() decides connectivity.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProductIdentity {
    pub release_version: String,
    pub bridge_protocol_gen: u32,
    pub api_gen: String,
    pub workspace_gen: String,
}

/// Exact Desktop/MCP integration contract, including the exposed Work APIs and
/// embedded guidance. Additions also advance the generation; no range negotiation.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BridgeContract {
    pub bridge_protocol_gen: u32,
}

/// Internal discovery file. Never return this DTO to an agent or log it: token
/// is a bearer credential. Optional values allow legacy discovery diagnostics.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDescriptor {
    pub session_id: String,
    pub endpoint: String,
    pub token: String,
    #[serde(default)]
    pub contract: Option<serde_json::Value>,
    #[serde(default)]
    pub identity: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthResponse {
    pub ok: bool,
    pub session_id: String,
    #[serde(default)]
    pub contract: Option<serde_json::Value>,
    #[serde(default)]
    pub identity: Option<serde_json::Value>,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeRequest {
    pub method: String,
    #[serde(default)]
    pub params: serde_json::Value,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub contract: Option<serde_json::Value>,
}

/// Decode untrusted compatibility data without reflecting its contents in errors.
pub fn decode_contract(
    value: Option<&serde_json::Value>,
) -> Result<BridgeContract, CompatibilityError> {
    let value = value.filter(|value| !value.is_null()).ok_or_else(|| {
        error(CompatibilityCode::ContractRequired, "contract", "Desktop/MCP bridge contract is required. Update the legacy application and restart it.")
    })?;
    let contract: BridgeContract = serde_json::from_value(value.clone()).map_err(|_| {
        error(
            CompatibilityCode::ContractInvalid,
            "contract",
            "Invalid Desktop/MCP bridge contract.",
        )
    })?;
    contract.validate()?;
    Ok(contract)
}

/// Stable, secret-free error envelope understood by both adapters and legacy MCP.
pub fn compatibility_failure(
    failure: &CompatibilityError,
    expected: &BridgeContract,
    actual: Option<&BridgeContract>,
) -> serde_json::Value {
    serde_json::json!({"ok":false,"error":{
        "code":failure.code,"field":failure.field,"message":failure.message,
        "expectedContract":expected,"actualContract":actual
    }})
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum CompatibilityCode {
    #[serde(rename = "MCP_CONTRACT_REQUIRED")]
    ContractRequired,
    #[serde(rename = "MCP_CONTRACT_INVALID")]
    ContractInvalid,
    #[serde(rename = "MCP_IDENTITY_INVALID")]
    IdentityInvalid,
    #[serde(rename = "MCP_BRIDGE_GENERATION_INVALID")]
    BridgeGenerationInvalid,
    #[serde(rename = "MCP_BRIDGE_GENERATION_MISMATCH")]
    BridgeGenerationMismatch,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompatibilityError {
    pub code: CompatibilityCode,
    pub field: String,
    pub message: String,
}

impl fmt::Display for CompatibilityError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}
impl std::error::Error for CompatibilityError {}

fn error(code: CompatibilityCode, field: &str, message: &str) -> CompatibilityError {
    CompatibilityError {
        code,
        field: field.into(),
        message: message.into(),
    }
}

/// Decimal generation IDs remain strings, matching the shared TypeScript API.
pub fn valid_generation(value: &str) -> bool {
    !value.is_empty()
        && (value == "0" || !value.starts_with('0'))
        && value.bytes().all(|c| c.is_ascii_digit())
        && value
            .parse::<u64>()
            .is_ok_and(|n| n <= 9_007_199_254_740_991)
}

pub fn valid_release_version(value: &str) -> bool {
    let parts: Vec<_> = value.split('.').collect();
    parts.len() == 3 && parts.iter().all(|part| valid_generation(part))
}

impl BridgeContract {
    pub fn validate(&self) -> Result<(), CompatibilityError> {
        if self.bridge_protocol_gen == 0 {
            return Err(error(
                CompatibilityCode::BridgeGenerationInvalid,
                "bridgeProtocolGen",
                "Desktop/MCP bridge generation must be a positive integer.",
            ));
        }
        Ok(())
    }
}

impl ProductIdentity {
    pub fn bridge_contract(&self) -> BridgeContract {
        BridgeContract {
            bridge_protocol_gen: self.bridge_protocol_gen,
        }
    }

    /// Validate build metadata, not compatibility with another application.
    pub fn validate(&self) -> Result<(), CompatibilityError> {
        for (field, valid) in [
            (
                "releaseVersion",
                valid_release_version(&self.release_version),
            ),
            ("apiGen", valid_generation(&self.api_gen)),
            ("workspaceGen", valid_generation(&self.workspace_gen)),
        ] {
            if !valid {
                return Err(error(
                    CompatibilityCode::IdentityInvalid,
                    field,
                    "Invalid Desktop/MCP identity metadata.",
                ));
            }
        }
        self.bridge_contract().validate()
    }
}

/// The expected contract comes from this application's build metadata.
/// Different product/API/Workspace versions are not connectivity criteria.
pub fn check_compatibility(
    expected: &BridgeContract,
    actual: Option<&BridgeContract>,
) -> Result<(), CompatibilityError> {
    expected.validate()?;
    let actual = actual.ok_or_else(|| {
        error(
            CompatibilityCode::ContractRequired,
            "contract",
            "Desktop/MCP bridge contract is required. Update the legacy application and restart it.",
        )
    })?;
    actual.validate()?;
    if expected.bridge_protocol_gen != actual.bridge_protocol_gen {
        return Err(error(
            CompatibilityCode::BridgeGenerationMismatch,
            "bridgeProtocolGen",
            "Desktop and MCP require the same bridge generation. Install matching-generation applications and restart them.",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn identity() -> ProductIdentity {
        ProductIdentity {
            release_version: "0.2.0".into(),
            bridge_protocol_gen: 1,
            api_gen: "1".into(),
            workspace_gen: "0".into(),
        }
    }

    #[test]
    fn wire_decode_errors_are_stable_and_never_reflect_credentials() {
        let expected = identity().bridge_contract();
        for value in [
            None,
            Some(serde_json::json!(null)),
            Some(serde_json::json!({"bridgeProtocolGen":"secret-token"})),
            Some(serde_json::json!({"bridgeProtocolGen":0})),
        ] {
            let error = decode_contract(value.as_ref()).unwrap_err();
            let envelope = compatibility_failure(&error, &expected, None);
            assert_eq!(envelope["ok"], false);
            assert!(envelope["error"]["message"].is_string());
            assert_eq!(
                envelope["error"]["expectedContract"]["bridgeProtocolGen"],
                1
            );
            assert!(envelope["error"]["actualContract"].is_null());
            assert!(!envelope.to_string().contains("secret-token"));
        }
    }

    #[test]
    fn identity_round_trips_without_secrets_or_a_release_id() {
        let value = serde_json::to_value(identity()).unwrap();
        assert_eq!(value["bridgeProtocolGen"], 1);
        assert_eq!(value.as_object().unwrap().len(), 4);
        assert_eq!(
            serde_json::from_value::<ProductIdentity>(value).unwrap(),
            identity()
        );
    }

    #[test]
    fn build_identity_requires_correct_fields_and_types() {
        let value = serde_json::to_value(identity()).unwrap();
        for field in [
            "releaseVersion",
            "bridgeProtocolGen",
            "apiGen",
            "workspaceGen",
        ] {
            let mut missing = value.clone();
            missing.as_object_mut().unwrap().remove(field);
            assert!(serde_json::from_value::<ProductIdentity>(missing).is_err());
        }
        let mut changed = value;
        changed["apiGen"] = serde_json::json!(1);
        assert!(serde_json::from_value::<ProductIdentity>(changed).is_err());
    }

    #[test]
    fn wire_contract_contains_only_the_bridge_generation() {
        let current = identity().bridge_contract();
        assert_eq!(
            serde_json::to_value(&current).unwrap(),
            serde_json::json!({"bridgeProtocolGen": 1})
        );
        for invalid in [
            serde_json::json!({}),
            serde_json::json!({"bridgeProtocolGen": "1"}),
            serde_json::json!({"bridgeProtocolGen": null}),
            serde_json::json!({"bridgeProtocolGen": -1}),
            serde_json::json!({"bridgeProtocolGen": 1.5}),
            serde_json::json!({"bridgeProtocolGen": 4_294_967_296_u64}),
            serde_json::json!({"bridgeProtocolGen": 1, "token": "secret"}),
        ] {
            assert!(serde_json::from_value::<BridgeContract>(invalid).is_err());
        }
    }

    #[test]
    fn same_generation_passes_but_missing_legacy_contract_does_not() {
        let current = identity().bridge_contract();
        assert_eq!(check_compatibility(&current, Some(&current)), Ok(()));
        assert_eq!(
            check_compatibility(&current, None).unwrap_err().code,
            CompatibilityCode::ContractRequired
        );
    }

    #[test]
    fn version_and_other_generations_do_not_decide_connectivity() {
        let current = identity();
        // Change each diagnostic independently, then all of them together.
        for fields in [
            vec!["releaseVersion"],
            vec!["apiGen"],
            vec!["workspaceGen"],
            vec!["releaseVersion", "apiGen", "workspaceGen"],
        ] {
            let mut value = serde_json::to_value(&current).unwrap();
            for field in fields {
                value[field] = serde_json::json!(if field == "releaseVersion" {
                    "0.3.0"
                } else {
                    "9"
                });
            }
            let changed: ProductIdentity = serde_json::from_value(value).unwrap();
            for (first, second) in [(&current, &changed), (&changed, &current)] {
                assert!(check_compatibility(
                    &first.bridge_contract(),
                    Some(&second.bridge_contract())
                )
                .is_ok());
            }
        }
    }

    #[test]
    fn generation_mismatch_is_rejected_in_both_directions_even_for_the_same_release() {
        let current = identity();
        for generation in [2, u32::MAX] {
            let mut changed = current.clone();
            changed.bridge_protocol_gen = generation;
            for (first, second) in [(&current, &changed), (&changed, &current)] {
                let failure =
                    check_compatibility(&first.bridge_contract(), Some(&second.bridge_contract()))
                        .unwrap_err();
                assert_eq!(failure.code, CompatibilityCode::BridgeGenerationMismatch);
                assert_eq!(failure.field, "bridgeProtocolGen");
            }
        }
    }

    #[test]
    fn configured_generation_is_not_hard_coded_in_the_protocol_library() {
        for generation in [1, 2, u32::MAX] {
            let contract = BridgeContract {
                bridge_protocol_gen: generation,
            };
            assert!(check_compatibility(&contract, Some(&contract)).is_ok());
        }
    }

    #[test]
    fn generation_zero_is_invalid_in_either_role_even_when_equal() {
        let current = identity().bridge_contract();
        let invalid = BridgeContract {
            bridge_protocol_gen: 0,
        };
        for (first, second) in [
            (&current, &invalid),
            (&invalid, &current),
            (&invalid, &invalid),
        ] {
            assert_eq!(
                check_compatibility(first, Some(second)).unwrap_err().code,
                CompatibilityCode::BridgeGenerationInvalid
            );
        }
    }

    #[test]
    fn malformed_diagnostic_metadata_is_rejected_by_the_build_validator() {
        for (field, invalid) in [
            ("releaseVersion", "v0.2.0"),
            ("releaseVersion", "0.02.0"),
            ("releaseVersion", "0.2"),
            ("apiGen", "01"),
            ("apiGen", "-1"),
            ("apiGen", "1.0"),
            ("workspaceGen", "9007199254740992"),
        ] {
            let mut value = serde_json::to_value(identity()).unwrap();
            value[field] = serde_json::json!(invalid);
            let invalid: ProductIdentity = serde_json::from_value(value).unwrap();
            assert_eq!(
                invalid.validate().unwrap_err().code,
                CompatibilityCode::IdentityInvalid
            );
        }
    }

    #[test]
    fn diagnostic_codes_are_stable_and_do_not_echo_invalid_input() {
        let mut invalid = identity();
        invalid.release_version = "secret invalid value".into();
        let value = serde_json::to_value(invalid.validate().unwrap_err()).unwrap();
        assert_eq!(value["code"], "MCP_IDENTITY_INVALID");
        assert!(!value.to_string().contains("secret"));
    }
}

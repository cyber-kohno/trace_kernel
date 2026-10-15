#[path = "../../release/build-support.rs"]
mod product_build;

fn main() {
    product_build::configure(
        &std::path::PathBuf::from(std::env::var_os("CARGO_MANIFEST_DIR").unwrap()).join("../.."),
        false,
    );
}

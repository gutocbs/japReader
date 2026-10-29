const requiredVersion = "24.22.1";

const unsupportedRuntimeMessage =
  "Node 24.22.1 is required for npm run package and npm run make. Use Node 24.22.1 and run npm install.";

function assertSupportedBuildRuntime(version = process.version) {
  if (version.replace(/^v/, "") !== requiredVersion) {
    throw new Error(unsupportedRuntimeMessage);
  }
}

if (require.main === module) {
  try {
    assertSupportedBuildRuntime();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { assertSupportedBuildRuntime };

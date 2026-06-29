# Changelog

All notable changes to this project will be documented in this file.

## [1.2.0](https://github.com/pmlabs-org/mcp-toggl/compare/mcp-toggl-v1.1.0...mcp-toggl-v1.2.0) (2026-06-29)


### Features

* add CI/CD, MCP Registry, and standardization ([96b1059](https://github.com/pmlabs-org/mcp-toggl/commit/96b1059d663bf15ecebd19eb094a05f8f538b115))
* add project write tools (create, update, archive) with cache invalidation ([604e1bb](https://github.com/pmlabs-org/mcp-toggl/commit/604e1bb348c398ec095e2591d76dd19569d97353))
* add request interfaces for write tools ([b51206c](https://github.com/pmlabs-org/mcp-toggl/commit/b51206cf0308703ec7b4a3b4147b1eda105523d1))
* add task and client write tools (create_task, update_task, create_client) ([5ae8633](https://github.com/pmlabs-org/mcp-toggl/commit/5ae86337f4dec8eadf31093b784282174a116b48))
* add time entry write tools (create, update, delete with confirm gate) ([84316bb](https://github.com/pmlabs-org/mcp-toggl/commit/84316bb6cbe0a78aa39d11db12a78ab6c6466058))
* add Toggl timeline tool ([#25](https://github.com/pmlabs-org/mcp-toggl/issues/25)) ([053b71c](https://github.com/pmlabs-org/mcp-toggl/commit/053b71cd548e26c6fd648af8c7a157ba112ee72a))
* add write API methods for projects, tasks, and clients ([eeb0873](https://github.com/pmlabs-org/mcp-toggl/commit/eeb08739020da13648827311e0567512515be569))
* multi-key rotation on Toggl rate-limit ([6357d63](https://github.com/pmlabs-org/mcp-toggl/commit/6357d63b02a395368e4cfdece2349d6f2ac026c9))
* npx package ready; stderr logging for MCP; CLI --help/--version; CHANGELOG; LICENSE; metadata ([07d13ef](https://github.com/pmlabs-org/mcp-toggl/commit/07d13ef13385dcbf6dd5b4710ea4e75b52d6b9f7))


### Bug Fixes

* **cache:** bound cached collections and retry delay ([#31](https://github.com/pmlabs-org/mcp-toggl/issues/31)) ([61b133a](https://github.com/pmlabs-org/mcp-toggl/commit/61b133a69a86d6d558628c64fb939eccfb3404ce))
* preserve local dates for Toggl periods ([#18](https://github.com/pmlabs-org/mcp-toggl/issues/18)) ([ee98861](https://github.com/pmlabs-org/mcp-toggl/commit/ee98861c1addc621fe4785bde4ef87f0c9a6a294))
* **release:** address Claude Desktop feedback ([#30](https://github.com/pmlabs-org/mcp-toggl/issues/30)) ([505aeb9](https://github.com/pmlabs-org/mcp-toggl/commit/505aeb9de44b7bc6b10fc065813e797bb2e48206))
* **release:** align metadata and docs ([#26](https://github.com/pmlabs-org/mcp-toggl/issues/26)) ([c9fa1b4](https://github.com/pmlabs-org/mcp-toggl/commit/c9fa1b4ee6f90db313f95236e32adb2aedd7dcd3))
* remove session-resurrection pattern; add persistence test ([786d724](https://github.com/pmlabs-org/mcp-toggl/commit/786d724b21c95bb49d92c01ce55104b038318656))
* skip retries on 4xx client errors ([#11](https://github.com/pmlabs-org/mcp-toggl/issues/11)) ([34fdbe9](https://github.com/pmlabs-org/mcp-toggl/commit/34fdbe9386095623c77eedfb1080485b4f96bb08))
* **test:** convert test-session-persistence.js to ESM ([c074938](https://github.com/pmlabs-org/mcp-toggl/commit/c0749389aa6945b654d0a809c886c235210ba524))

## [1.1.0](https://github.com/verygoodplugins/mcp-toggl/compare/v1.0.0...mcp-toggl-v1.1.0) (2026-05-01)


### Features

* add CI/CD, MCP Registry, and standardization ([96b1059](https://github.com/verygoodplugins/mcp-toggl/commit/96b1059d663bf15ecebd19eb094a05f8f538b115))
* add Toggl timeline tool ([#25](https://github.com/verygoodplugins/mcp-toggl/issues/25)) ([053b71c](https://github.com/verygoodplugins/mcp-toggl/commit/053b71cd548e26c6fd648af8c7a157ba112ee72a))
* npx package ready; stderr logging for MCP; CLI --help/--version; CHANGELOG; LICENSE; metadata ([07d13ef](https://github.com/verygoodplugins/mcp-toggl/commit/07d13ef13385dcbf6dd5b4710ea4e75b52d6b9f7))


### Bug Fixes

* **cache:** bound cached collections and retry delay ([#31](https://github.com/verygoodplugins/mcp-toggl/issues/31)) ([61b133a](https://github.com/verygoodplugins/mcp-toggl/commit/61b133a69a86d6d558628c64fb939eccfb3404ce))
* preserve local dates for Toggl periods ([#18](https://github.com/verygoodplugins/mcp-toggl/issues/18)) ([ee98861](https://github.com/verygoodplugins/mcp-toggl/commit/ee98861c1addc621fe4785bde4ef87f0c9a6a294))
* **release:** address Claude Desktop feedback ([#30](https://github.com/verygoodplugins/mcp-toggl/issues/30)) ([505aeb9](https://github.com/verygoodplugins/mcp-toggl/commit/505aeb9de44b7bc6b10fc065813e797bb2e48206))
* **release:** align metadata and docs ([#26](https://github.com/verygoodplugins/mcp-toggl/issues/26)) ([c9fa1b4](https://github.com/verygoodplugins/mcp-toggl/commit/c9fa1b4ee6f90db313f95236e32adb2aedd7dcd3))
* skip retries on 4xx client errors ([#11](https://github.com/verygoodplugins/mcp-toggl/issues/11)) ([34fdbe9](https://github.com/verygoodplugins/mcp-toggl/commit/34fdbe9386095623c77eedfb1080485b4f96bb08))

## 1.0.0 - 2025-09-06
- Initial public release
- Added npx usage documentation for Claude Desktop and Cursor
- Added CLI flags: `--help` and `--version`
- Added .npmignore to publish only compiled output
- Added package metadata (repository, homepage, bugs, engines)

# Backend Endpoint Template

Use these files when adding a new backend REST endpoint in the current repository layout.

The current backend does not use one-file-per-endpoint routing, so endpoint work must stay aligned across:

- `backend/openapi/openapi.yaml`
- `backend/src/runtime.js`
- `backend/src/validation.js`
- matching backend integration/contract tests

Template inventory:

- `openapi-path.fragment.yaml.tmpl`
- `runtime-route.snippet.js.tmpl`
- `runtime-handler.snippet.js.tmpl`
- `validation.request-response.snippet.js.tmpl`
- `runtime.integration.test.js.tmpl`

Expected completion checklist:

1. Add the OpenAPI path/operation contract.
2. Add the `route()` match in `backend/src/runtime.js`.
3. Add the runtime handler branch and response shape.
4. Add request/response validation hooks in `backend/src/validation.js`.
5. Add or update integration and contract-conformance coverage.
6. Update docs if the endpoint is operator-facing.

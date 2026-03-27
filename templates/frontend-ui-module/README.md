# Frontend UI Module Template

Use this template for new frontend UI controllers that follow the current factory-style pattern:

- one `create...Controller()` export
- no hidden global state
- injected dependencies through the factory options object
- focused unit tests in `frontend/test/`

You can create files manually from the templates here or generate a starter pair with:

```bash
node ./scripts/scaffold-ui-module.mjs example-widget-controller
```

The scaffold writes:

- `frontend/src/public/ui/example-widget-controller.js`
- `frontend/test/example-widget-controller.test.js`

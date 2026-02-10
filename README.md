# Change Order Web POC

Standalone proof-of-concept app for contractor change-order submission.

## Scope

- No authentication (demo-only flow)
- Save draft and final submit actions
- Final submit checklist enforcement:
  - scope clarity
  - quantity/area/amount
  - labor/material pricing
  - additional charge explanation
  - unit price derivable
  - justification fields
  - supporting photo attachment
  - multi-line-item details when multi-item is selected
- Final submit blocked if work occurred more than 24 hours ago

## Run

```bash
pnpm --filter @remi/change-order-web dev
```

Open `http://localhost:3011`.

## Notes

- Persistence is in-memory for POC only and resets when the server restarts.

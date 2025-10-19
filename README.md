# Nomenclator Key Reconstructor

React + TypeScript + Vite app for semi-automatic reconstruction of nomenclator keys.

## Scripts

- Dev app: `npm run dev`
- Build app: `npm run build`
- Lint: `npm run lint`
- Preview build: `npm run preview`
- Storybook (UI docs): `npm run storybook`
- Build Storybook: `npm run build-storybook`

## Storybook

This project includes Storybook configuration and example stories for the core UI components:

- MappingTable (OT grid + ZT distribution + DnD)
- KeyTable (aggregated OT → ZT keys with locks and violations)
- OTCell (single grid cell)
- ZTToken (draggable cipher token)

Install Storybook and run it locally (Windows PowerShell):

```powershell
npm install -D storybook @storybook/react-vite @storybook/react @storybook/addon-essentials @storybook/addon-actions @storybook/addon-interactions
npm run storybook
```

Build a static Storybook site:

```powershell
npm run build-storybook
```

## Notes

- Drag-and-drop uses @dnd-kit/core; stories show static distributions only.
- Some stories depend on rowGroups to simulate allocations identical to the app behavior.
    - KeyTable (aggregated OT → ZT keys with locks and violations)

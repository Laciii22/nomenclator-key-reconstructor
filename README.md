# Nomenclator Key Reconstructor

A React + TypeScript application for semi-automatic reconstruction of nomenclator cipher keys from paired plain text (OT) and cipher text (ZT).

## What is a Nomenclator?

A **nomenclator** is a historical cipher that combines:
- **Character substitution**: individual letters → cipher tokens
- **Code words**: whole words or phrases → cipher tokens
- **Nulls (deception tokens)**: meaningless tokens to confuse cryptanalysts

This tool helps cryptographers and historians reconstruct the key by:
1. Aligning plain text (OT - Originaltext) with cipher text (ZT - Ziffertext)
2. Suggesting mappings based on frequency analysis
3. Allowing manual refinement through drag-and-drop and locking
4. Supporting both delimiter-separated and fixed-length cipher formats

## Features

- **Flexible parsing**: Handle both separated tokens (e.g., `123:456:789`) and fixed-length tokens (e.g., `123456789` with length 3)
- **Frequency analysis**: Automatic suggestions based on OT↔ZT frequency correlation
- **Interactive grid**: Drag-and-drop tokens, lock confirmed mappings, highlight errors
- **Deception handling**: Mark and exclude null tokens from analysis
- **Local persistence**: Auto-save work in browser localStorage
- **Single/multiple keys mode**: Support for homophonic substitution

## Quick Start

### Prerequisites

- Node.js 18+ and npm

### Installation & Development

```powershell
# Install dependencies
npm install

# Start development server
npm run dev

# Open browser to http://localhost:5173 (or the URL shown in terminal)
```

### Build for Production

```powershell
npm run build
npm run preview  # Preview the production build
```

### Testing

```powershell
npm run test     # Run unit tests
npm run lint     # Check code quality
```

## Usage

1. **Enter plain text (OT)**: Type or paste the deciphered text in the OT textarea
2. **Enter cipher text (ZT)**: Paste cipher tokens in the ZT textarea
3. **Choose parsing mode**:
   - **Separator**: For tokens like `12:34:56` (choose delimiter)
   - **Fixed-length**: For tokens like `123456` (specify character count per token)
4. **Run analysis**: Click "Run analysis" to get frequency-based suggestions
5. **Review mappings**: Check the key table for suggested OT→ZT pairs
6. **Lock confident mappings**: Click the lock icon on cells you've verified
7. **Handle mismatches**:
   - If ZT has extra tokens, mark them as deception (bracket icon)
   - If counts don't match, verify your inputs
8. **Refine manually**: Drag tokens between cells or use candidate selectors

## Project Structure

```
src/
├── components/         # React UI components
│   ├── controls/       # Input controls and parsing config
│   ├── layout/         # App layout and navigation
│   ├── table/          # Grid components (OTCell, ZTToken, MappingTable, KeyTable)
│   └── types.ts        # Component prop types
├── hooks/              # Custom React hooks
│   ├── useNomenklator.ts    # Main state orchestration
│   ├── useParsing.ts        # ZT parsing and validation
│   ├── useMapping.ts        # OT/ZT allocation
│   ├── useAnalysis.ts       # Frequency analysis
│   └── nomenclator/         # Nomenclator-specific logic (DnD, grouping, shifting)
├── types/              # Core domain types (OTChar, ZTToken, etc.)
├── utils/              # Utility functions
│   ├── analyzer.ts          # Frequency analysis engine
│   ├── allocation.ts        # Token distribution algorithm
│   ├── columns.ts           # Grid column computation
│   ├── parseStrategies.ts   # Parsing mode helpers
│   ├── parse/               # Parsers (fixed, separator)
│   └── selection/           # Auto-selection algorithms
├── mapping/            # Manual token shifting logic
├── pages/              # Page components
└── main.tsx            # App entry point
```

### Key Files

- **[NomenklatorPage.tsx](src/pages/NomenklatorPage.tsx)**: Main page component with drag-and-drop context
- **[useNomenklator.ts](src/hooks/useNomenklator.ts)**: Central state management hook
- **[analyzer.ts](src/utils/analyzer.ts)**: Frequency analysis and candidate scoring
- **[MappingTable.tsx](src/components/table/MappingTable.tsx)**: Interactive OT/ZT grid
- **[KeyTable.tsx](src/components/table/KeyTable.tsx)**: Reconstructed key display

## Technologies

- **React 19** with TypeScript
- **Vite** for fast development and building
- **@dnd-kit** for drag-and-drop interactions
- **Tailwind CSS** for styling
- **Vitest** for testing

## Storybook (Optional)

This project includes Storybook configuration for UI component development:

```powershell
# Install Storybook dependencies (if not already installed)
npm install -D storybook @storybook/react-vite @storybook/react @storybook/addon-essentials @storybook/addon-actions @storybook/addon-interactions

# Run Storybook
npm run storybook

# Build static Storybook site
npm run build-storybook
```

## Development Notes

- **No backend**: All processing happens client-side
- **Browser storage**: Work is auto-saved to localStorage
- **Performance**: Large texts (>1000 characters) may slow down the grid
- **Browser compatibility**: Modern browsers with ES2020+ support

## Contributing

This is a research/educational tool for historical cryptography. Contributions welcome:
- Bug fixes and performance improvements
- Better frequency analysis algorithms
- UI/UX enhancements
- Documentation improvements

## License

This project is for academic and research use.

## Acknowledgments

Built for diploma work on historical nomenclator cipher reconstruction.

# Nomenclator Key Reconstructor

A React + TypeScript application for semi-automatic reconstruction of nomenclator cipher keys from paired plain text (OT) and cipher text (ZT).

## What is a Nomenclator?

A **nomenclator** is a historical cipher that combines:
- **Character substitution**: individual letters → cipher tokens
- **Code words**: whole words or phrases → cipher tokens
- **Nulls (deception tokens)**: meaningless tokens to confuse cryptanalysts

This tool helps cryptographers and historians reconstruct the key by:
1. Aligning plain text (OT - Open Text) with cipher text (ZT - Cipher Text)
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
npm run test:watch
npm run dev:test # Run app + tests in watch mode (concurrently)
npm run lint     # Check code quality
npm run prune    # Detect unused TypeScript exports
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
├── components/                 # UI components
│   ├── common/                 # Modals and shared UI elements
│   ├── controls/               # Input controls and candidate selectors
│   ├── layout/                 # App layout and navigation
│   ├── table/                  # PT/CT mapping grid and key table
│   └── types.ts
├── hooks/                      # State and domain orchestration hooks
│   ├── nomenclator/            # Nomenclator-specific helper hooks
│   ├── useNomenclator.ts       # Main orchestrator hook
│   ├── useAnalysis.ts          # Analysis trigger/state
│   ├── useParsing.ts           # Parsing and validation
│   ├── useMapping.ts           # PT/CT allocation and mapping state
│   └── useLocalSettings.ts     # localStorage-backed settings
├── mapping/                    # Manual shift/mapping logic
├── pages/                      # Route-level components
├── types/                      # Domain types
├── utils/                      # Analysis, allocation, parse and helper functions
│   ├── parse/                  # Fixed-length/separator parsers
│   ├── analyzer.ts
│   ├── multiKeyMapping.ts
│   └── exportKey.ts
├── workers/                    # Web Worker(s) for analysis
└── main.tsx                    # App entry point

tests/
├── unit/                       # Unit tests for core algorithms
├── integration/                # End-to-end workflow-level tests
└── helpers.ts                  # Shared test utilities
```

### Key Files

- **[NomenclatorPage.tsx](src/pages/NomenclatorPage.tsx)**: Main page component with drag-and-drop context
- **[useNomenklator.ts](src/hooks/useNomenklator.ts)**: Central state management hook
- **[analyzer.ts](src/utils/analyzer.ts)**: Frequency analysis and candidate scoring
- **[MappingTable.tsx](src/components/table/MappingTable.tsx)**: Interactive OT/ZT grid
- **[KeyTable.tsx](src/components/table/KeyTable.tsx)**: Reconstructed key display
- **[analysis.worker.ts](src/workers/analysis.worker.ts)**: Background analysis execution to keep UI responsive

## Technologies

- **React 19** with TypeScript
- **Vite** for fast development and building
- **@dnd-kit** for drag-and-drop interactions
- **Tailwind CSS** for styling
- **Vitest** for testing

## Development Notes

- **No backend**: All processing happens client-side
- **Browser storage**: Work is auto-saved to localStorage
- **Background analysis**: Frequency analysis runs in a Web Worker
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

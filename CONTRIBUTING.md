# Contributing to IntentOS

Thank you for your interest in contributing to IntentOS!

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone <your-fork-url>`
3. Install dependencies: `pnpm install`
4. Create a branch: `git checkout -b feat/your-feature`
5. Make your changes
6. Run checks: `pnpm build && pnpm typecheck && pnpm lint`
7. Commit your changes using [Conventional Commits](https://www.conventionalcommits.org/)
8. Push and open a Pull Request

## Development

```bash
pnpm install      # Install all dependencies
pnpm dev          # Start development servers
pnpm build        # Build all packages
pnpm typecheck    # Type-check all packages
pnpm lint         # Lint all packages
pnpm format       # Format code with Prettier
pnpm test         # Run tests
```

## Code Style

- We use ESLint and Prettier for code formatting
- TypeScript strict mode is enabled
- All code must pass `pnpm typecheck` and `pnpm lint` before merging

## Reporting Issues

Please use GitHub Issues to report bugs or request features. Include as much detail as possible.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

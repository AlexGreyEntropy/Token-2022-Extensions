# Token-2022 Extensions in Anchor with a built-in CLI tool for demo use

Anchor project for all 18 Token-2022 extensions, using official documentation from [QuickNode](https://www.quicknode.com/guides/solana-development/spl-tokens/token-2022/transfer-fees), [Solana Program](https://www.solana-program.com/docs/token-2022/extensions), [Solana Labs repository](https://github.com/solana-labs/solana-program-library), [Blueshift documentation](https://learn.blueshift.gg/en/courses/token-2022-with-web3js), and [Solana Developer Guides](https://solana.com/developers/guides/token-extensions).

## Project Overview

Made this project to learn about Token-2022 (SPL Token Extensions) using Anchor, with all 18 extensions TypeScript tests and a CLI tool for demo use.

### Key Features
- All 18 Token-2022 extensions.
- Follows examples from QuickNode, Solana Program, Solana Labs repository, Blueshift documentation, and Solana Developer Guides.
- Added error handling and validation
- CLI tool for creating tokens with extensions (not all extensions are available in the CLI tool)

## Quick Start with CLI Tool

The fastest way to get started is with the CLI tool that makes creating Token-2022 extensions simple and customizable (not all extensions are available in the CLI tool).

### 1-Minute Setup

```bash
# Clone the repository
git clone <this-repo>
cd token-2022-extensions-anchor

# Install dependencies
npm install

# Run the interactive setup wizard
npm run cli:setup

# Interactive configuration for all settings
npm run cli:config --interactive

# Validate your configuration
npm run cli:validate

# Interactive mode for creating tokens
npm run cli:interactive

# Ready to go
npm run cli:examples

```

#### Option 1: Interactive Mode (recommended for beginners)
```bash
npm run cli:interactive
```
Follow the guided commands to create your token step by step.

#### Option 2: Direct Commands (for advanced users)

**DeFi Token type with 0.5% Transfer Fee**
```bash
node bin/token-extensions-cli.js create-transfer-fee \
  --name "DeFi Token" \
  --fee-basis-points 50 \
  --mint \
  --amount 10000
```

**Yield Bearing Token type with 5% Annual Interest**
```bash
node bin/token-extensions-cli.js create-interest-bearing \
  --name "Yield Bearing Token" \
  --rate 500 \
  --mint \
  --amount 5000
```

**Achievement Badge type (Soulbound NFT)**
```bash
node bin/token-extensions-cli.js create-soulbound \
  --name "Master Trader Badge" \
  --mint \
  --amount 1
```

### View Your Tokens
```bash
# List all created tokens
node bin/token-extensions-cli.js list

# Filter by type
node bin/token-extensions-cli.js list --type transfer-fee
```

### Quick Tips

**Get SOL for Testing**
```bash
# Request devnet SOL
solana airdrop 2

# Check balance
solana balance
```

**Configuration**
```bash
# Interactive configuration
npm run cli:config --interactive

# Show current settings
npm run cli:config --show

# Switch networks
npm run cli:config --network mainnet-beta

# Set default values
npm run cli:config --default-decimals 9 --default-amount 10000

# Configure behavior
npm run cli:config --confirm-transactions false --save-token-info true
```

**Help and Examples**
```bash
# General help
npm run cli --help

# Command-specific help
npm run cli create-transfer-fee --help

# Usage examples
npm run cli:examples

# Validate configuration
npm run cli:validate
```

### Available Token Types

| Token Type | Command | Description |
|------------|---------|-------------|
| **Transfer Fee** | `create-transfer-fee` | Collect fees on transfers |
| **Interest-Bearing** | `create-interest-bearing` | Earn interest over time |
| **Soulbound** | `create-soulbound` | Non-transferable tokens |
| **Closeable** | `create-closeable` | Can be closed to reclaim rent |
| **Default Account State** | `create-default-account-state` | Sets initial state for new token accounts |
| **Permanent Delegate** | `create-permanent-delegate` | Global authority over all token accounts |
| **Metadata Pointer** | `create-metadata-pointer` | Points to metadata location |
| **Transfer Hook** | `create-transfer-hook` | Custom program execution on transfers |
| **Group Pointer** | `create-group-pointer` | Points to group membership data |
| **Member Pointer** | `create-member-pointer` | Points to member data |
| **Scaled UI Amount** | `create-scaled-ui-amount` | Custom UI scaling for amounts |
| **Multi-Extension** | `create-multi-extension` | Combine multiple mint extensions in one token |

> **Note**: Some Token-2022 extensions like Immutable Owner, Required Memo, and CPI Guard are **account extensions** that must be applied when creating token accounts, not during mint. These require different approach and are available in the Anchor program but not yet in the CLI tool.

### Multi-Extension Tokens

Create tokens with multiple extensions combined using interactive commands:

```bash
# Interactive multi-extension creation (not all extensions are available in the CLI tool)
npm run cli:interactive
# Select "Multi-Extension Token" and follow the guided commands

# Direct command with multiple extensions
npm run cli create-multi-extension \
  --name "DeFi Token" \
  --transfer-fee \
  --interest-bearing \
  --closeable \
  --mint \
  --amount 100000

# Gaming NFT with multiple restrictions
npm run cli create-multi-extension \
  --name "Gaming NFT Collection" \
  --non-transferable \
  --permanent-delegate 11111111111111111111111111111111 \
  --metadata-pointer \
  --mint \
  --amount 1

# DeFi Token with all features
npm run cli create-multi-extension \
  --name "DeFi Token" \
  --transfer-fee \
  --interest-bearing \
  --permanent-delegate \
  --closeable \
  --metadata-pointer \
  --mint \
  --amount 500000
```

### Troubleshooting

**"Wallet not found"**
```bash
# Run setup wizard
npm run cli:setup

# Or create manually
solana-keygen new --outfile wallet.json
```

**"Connection failed"**
```bash
# Validate configuration
npm run cli:validate

# Check internet connection
# Try: solana airdrop 1 to test connection
```

**"Insufficient funds"**
```bash
# Check balance
npm run cli:validate

# Get SOL for testing
solana airdrop 2
```

**"Command not found"**
```bash
# Use npm scripts
npm run cli --help

# Or install globally
npm install -g .
```

**Configuration Issues**
```bash
# Interactive configuration
npm run cli:config --interactive

# Reset to defaults
rm token-cli.config.json
npm run cli:setup
```

## Extensions

### Working in CLI Tool (Mint Extensions)
1. **Transfer Fee** - Collects fees on transfers (with fee withdrawal)
2. **Interest-Bearing** - Tokens that accrue interest over time
3. **Non-Transferable** - Creates soulbound tokens
4. **Mint Close Authority** - Allows closing mints with zero supply
5. **Default Account State** - Sets initial state for new token accounts
6. **Permanent Delegate** - Global authority over all token accounts
7. **Metadata Pointer** - Points to metadata location
8. **Transfer Hook** - Custom program execution on transfers
9. **Group Pointer** - Points to group membership data
10. **Member Pointer** - Points to member data
11. **Scaled UI Amount** - Custom UI scaling for amounts (note implementation)
12. **Multi-Extension** - Combine multiple extensions in one token

### Not in CLI Tool (Anchor Program Only)
13. **Metadata** - On-chain token metadata storage
14. **Group** - Collection/group functionality
15. **Member** - Individual member in a group
16. **Pausable** - Ability to pause token operations

### Account Extensions (Requires Special Handling)
17. **Immutable Owner** - Prevents ownership changes
18. **Required Memo** - Requires memo for incoming transfers
19. **CPI Guard** - Prevents unauthorized cross-program invocations

> **CLI Status**: 12/19 extensions available via CLI tool. Account extensions require different token account creation method.

## Development Setup

### Prerequisites
- Node.js 18+
- Rust 1.70+
- Solana CLI 1.16+
- Anchor 0.31+

### Installation
```bash
# Clone the repository
git clone <repository-url>
cd token-2022-extensions-anchor

# Install dependencies
npm install

# Build the Anchor program
anchor build

# Create wallet for testing

# Option 1: Generate a new keypair
solana-keygen new --outfile wallet.json
# Option 2: Use existing keypair
cp ~/.config/solana/id.json wallet.json

# Run full tests
npm run test:tests/full_extensions.test.ts
```


## Documentation

### Transfer Fees ([QuickNode Guide](https://www.quicknode.com/guides/solana-development/spl-tokens/token-2022/transfer-fees))
- Fee calculation: `(amount * feeBasisPoints) / 10_000`
- Maximum fee setting
- Fee collection and withdrawal
- Separate transfer and withdrawal authorities

### Required Memo ([QuickNode Guide](https://www.quicknode.com/guides/solana-development/spl-tokens/token-2022/required-memos))
- Account-level extension
- Memo validation for incoming transfers

### Metadata Extension ([QuickNode NFT Guide](https://www.quicknode.com/guides/solana-development/spl-tokens/token-2022/nft))
- MetadataPointer + TokenMetadata combination
- NFT creation
- Self-referencing metadata addresses

### All Extensions ([Solana Program Docs](https://www.solana-program.com/docs/token-2022/extensions))
- Space calculation using `getMintLen` and `getAccountLen`
- Correct initialization sequences
- Extension type validation


## Contributions are welcome!

**Built for the Solana ecosystem** 
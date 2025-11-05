# Nillion Collection Explorer UI

A `Next.js` TypeScript application for creating and managing Nillion Storage schemas, collections, and records.

## Features

- **Collection Management**: Create, view, and delete both standard and owned collections
- **Schema Builder**: Define custom schemas with secret fields that are automatically encrypted
- **Data Management**: Add, view, and delete records with real-time updates
- **Secret Sharing**: Fields marked as "secret" use Shamir's secret sharing across multiple nodes
- **Two Collection Types**:
  - **Standard Collections**:
    - Managed by builders
    - Used for application data
    - Can contain encrypted or plaintext data
    - Support indexing and queries
  - **Owned Collections**:
    - Store user-owned private data
    - Each document has individual ACLs
    - Users control access permissions
    - Support fine-grained permission types

## Getting Started

### Prerequisites

- Node.js 18+ and pnpm
- Access to Nillion testnet
- A Nillion API key (private key in hex format)

### Installation

1. Clone and install dependencies:

```bash
cd demo-ui
pnpm install
```

2. Configure the application:

- Start the development server with `pnpm dev`
- Click the settings gear icon in the navigation bar
- Enter your Nillion API key and network endpoints
- The configuration is saved in your browser's localStorage

Default testnet endpoints are pre-configured, but you can customize them as needed.

### Development

```bash
# Start development server
pnpm dev

# Type checking
pnpm typecheck

# Linting
pnpm lint

# Build for production
pnpm build
```

## Usage

### Creating Collections

1. Click "Create New" on the homepage
2. Fill in collection details:
   - **Name**: Display name for your collection
   - **Type**: Choose between Standard or Owned:
     - **Standard**: Builder-managed collections for application data
     - **Owned**: User-owned collections with individual document ACLs
3. Define your schema:
   - Add fields with names, types, and descriptions
   - Mark sensitive fields as "Secret" for encryption
   - Set required fields
4. Click "Create Collection"

### Managing Data

1. Click on any collection from the list
2. Use "Add Record" to create new entries
3. Secret fields are automatically encrypted using `%allot` syntax
4. View, filter, and delete records as needed

### Secret Fields

Fields marked as "Secret" in the schema are:

- Encrypted using Shamir's secret sharing
- Distributed across multiple nilDB nodes
- Automatically handled by the secretvaults-ts library
- Displayed as "🔒 Encrypted" in the UI

## Architecture

The demo uses:

- **Next.js App Router** for the frontend framework
- **Tailwind CSS** for styling
- **@nillion/secretvaults** for backend nilDB operations
- **@nillion/nuc** for authentication

### API Routes

- `GET/POST /api/collections` - List and create collections
- `GET/DELETE /api/collections/[id]` - Collection metadata and deletion
- `GET/POST/PUT/DELETE /api/data/[collectionId]` - Data management operations

### Components

- **CollectionList**: Display all collections with metadata
- **CollectionForm**: Create new collections with schema builder
- **DataManager**: Manage records within a collection

## Development Notes

- Network configuration and API keys are managed through the settings UI (gear icon)
- All configuration is stored in browser localStorage (no .env files needed)
- Secret fields use the `{ "%allot": value }` pattern internally
- All operations are performed across multiple nilDB nodes for redundancy
- The UI automatically handles encryption/decryption of secret fields

## Example Collection Schema

```typescript
{
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "_id": { "type": "string" },
      "service": { "type": "string" },
      "username": { "type": "string" },
      "apiKey": {
        "type": "object",
        "properties": { "%allot": { "type": "string" } },
        "required": ["%allot"],
        "isSecret": true
      }
    },
    "required": ["_id", "service", "username", "apiKey"]
  }
}
```

This creates a collection for storing API keys where the `apiKey` field is automatically encrypted and secret-shared.

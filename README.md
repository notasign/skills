# @notasign/skill

TypeScript implementation for Nota Sign electronic signature platform with complete API coverage, envelope management, document upload, and automated signing workflows.

## Installation

```bash
npm install @notasign/skill
```

Or use directly with npx:

```bash
npx @notasign/skill init
```

## Quick Start

### 1. Initialize Configuration

```bash
npx @notasign/skill init
```

You will be prompted to enter:
- App ID
- App Key (Base64 encoded PKCS#8 private key)
- User Code
- Server Region (CN/AP1/AP2/EU1)
- Environment (PROD/UAT)

Configuration will be saved to `~/.notasign/config.json`.

### 2. Send Envelope

**Interactive Mode:**

```bash
npx @notasign/skill
```

**Command Line Mode:**

```bash
npx @notasign/skill --file /path/to/document.pdf \
  --signers '[{"userName":"张三","userEmail":"zhangsan@example.com"}]' \
  --subject "合同签署"
```

### Parameters

| Parameter | Alias | Description | Required |
|-----------|-------|-------------|----------|
| `--file` | `-f` | Document path (local or URL) | Yes |
| `--signers` | - | Signers JSON array | Yes |
| `--subject` | `-s` | Email subject | No |

## Server Regions

| Region | Description |
|--------|-------------|
| CN | China (openapi-cn.notasign.cn) |
| AP1 | Asia Pacific 1 - Singapore |
| AP2 | Asia Pacific 2 - Hong Kong |
| EU1 | Europe 1 - Frankfurt |

## API Usage

```typescript
import { sendDocumentForSigning, createClient } from '@notasign/skill';

// Initialize client
createClient({
  appId: 'your-app-id',
  appKey: 'your-base64-encoded-private-key',
  userCode: 'your-user-code',
  serverRegion: 'AP2',
  environment: 'PROD'
});

// Send document
const envelopeId = await sendDocumentForSigning(
  '/path/to/document.pdf',
  [{ userName: '张三', userEmail: 'zhangsan@example.com' }],
  'Contract Signing'
);

console.log('Envelope ID:', envelopeId);
```

## Requirements

- Node.js >= 18.0.0

## License

MIT

## Links

- [Nota Sign Console](https://account.notasign.com)
- [API Documentation](https://docs.notasign.com)
- [GitHub Repository](https://github.com/notasign/skills)

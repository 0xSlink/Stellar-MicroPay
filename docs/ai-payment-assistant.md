# AI Payment Assistant

The AI Payment Assistant is an intelligent feature that allows users to describe payments in natural language and automatically fills out the payment form with the extracted details.

## Features

- **Natural Language Processing**: Users can describe payments in plain English
- **Smart Extraction**: Automatically extracts amount, recipient address, and memo
- **Validation & Clarification**: Shows helpful prompts for missing information
- **Form Pre-filling**: Seamlessly integrates with the existing SendPaymentForm
- **Floating Button**: Accessible from anywhere on the dashboard
- **Error Handling**: Graceful fallbacks and user-friendly error messages
- **Degraded Mode**: Clear messaging when the AI service is unavailable

## Architecture

### Frontend (Static Export)

The frontend is deployed as a static export (Next.js `output: "export"`). The AI Payment Assistant component (`frontend/components/AIPaymentAssistant.tsx`) requests the parsing endpoint from the Express backend at `{NEXT_PUBLIC_API_URL}/api/parse-payment`.

When the endpoint is unreachable, the assistant displays a degraded-mode message encouraging users to fill in payment details manually.

### Backend (Express)

The Express backend provides the `/api/v1/parse-payment` endpoint (`backend/src/routes/aiPayment.ts`), which:

- Accepts POST requests with natural language input
- Uses Claude Haiku model for parsing
- Returns structured payment data
- Handles validation and error cases
- Requires `ANTHROPIC_API_KEY` environment variable

### Production Setup

In production, the frontend static files are served by nginx, and the backend Express API runs as a separate service. The frontend calls the backend API URL (configured via `NEXT_PUBLIC_API_URL`) for all dynamic requests, including payment parsing.

## How It Works

1. **User clicks the floating AI button** (✨ sparkles icon in bottom-right)
2. **Types natural language** like "Send 50 XLM to GABC123... for design work"
3. **Frontend sends request to Express backend** at `/api/v1/parse-payment`
4. **Claude AI parses the intent** and extracts structured payment data
5. **User confirms the details** in a clean preview interface
6. **Payment form gets pre-filled** automatically
7. **User can review and submit** the payment normally

## Example Inputs

The AI assistant can understand various natural language formats:

```
✅ "Send 50 XLM to GABC123... for design work"
✅ "Pay Alice 25 XLM for consulting"
✅ "Transfer 100 XLM to my colleague for the project"
✅ "Send payment of 75 XLM to GDEF456... memo: invoice payment"
✅ "Pay 30 XLM to GHIJ789... for freelance work"
```

## Setup

### Environment Variables

**Frontend (`frontend/.env.local`)**:

```bash
NEXT_PUBLIC_API_URL=http://localhost:4000  # or your backend URL
```

**Backend (`backend/.env`)**:

```bash
ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

### API Endpoint

**Endpoint**: `POST /api/v1/parse-payment` (on the Express backend)

**Request**:

```json
{
  "input": "Send 50 XLM to GABC123 for design work"
}
```

**Response**:

```json
{
  "amount": "50 XLM",
  "recipient": "GABC123",
  "memo": "design work",
  "isValid": true,
  "clarification": ""
}
```

## Technical Implementation

### Components

1. **AIPaymentAssistant.tsx** - Main modal component
2. **FloatingAssistantButton** - Floating action button
3. **backend/src/routes/aiPayment.ts** - Express endpoint for Claude integration

### Integration Points

- **Dashboard**: Hosts the floating button and modal
- **SendPaymentForm**: Accepts `aiPrefill` prop for form population
- **Validation**: Uses existing Stellar address validation

### Error Handling

The assistant handles various error scenarios gracefully:

- **Missing or invalid API key**: Shows degraded-mode message
- **Network failures**: Displays "AI assistant is currently unavailable" with fallback instructions
- **Ambiguous payment descriptions**: Asks clarifying questions
- **Invalid Stellar addresses**: Flags during parsing
- **Missing required fields**: Prompts user for additional information

## Degraded Mode

If the Express backend is unreachable or the Anthropic API is not configured:

- The assistant displays an error message
- Users are encouraged to fill in payment details manually
- The UI remains functional and non-blocking
- No errors are thrown to the application

## Usage Examples

### Basic Payment

```
Input: "Send 50 XLM to GABC123 for design work"
Output:
- Amount: "50 XLM"
- Recipient: "GABC123"
- Memo: "design work"
```

### Incomplete Information

```
Input: "Pay Alice for the job"
Output:
- Clarification: "What amount should be sent?"
- Shows retry interface
```

### Multiple Recipients (Not Supported)

```
Input: "Send 50 XLM to Alice and 30 XLM to Bob"
Output:
- Clarification: "Multiple payments detected. Please send one payment at a time."
```

## Testing

Run the test suite:

```bash
npm test AIPaymentAssistant.test.tsx
```

Tests cover:

- Component rendering
- User interactions
- API integration
- Error handling
- Form integration

## Accessibility

The AI assistant is fully accessible:

- Keyboard navigation support
- Screen reader compatible
- ARIA labels and roles
- Focus management
- Escape key handling

## Performance

- Lightweight Claude Haiku model for fast responses
- Minimal bundle size impact
- Efficient state management
- Optimized re-renders

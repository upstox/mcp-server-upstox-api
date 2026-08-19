# mcp-server-upstox-api

A MCP server for integrating with the Upstox trading API.

## Quick Start

### Setup

1. Clone the repository:
```bash
git clone https://github.com/yourusername/mcp-server-upstox-api.git
cd mcp-server-upstox-api
```

2. Install dependencies:
```bash
npm install
```

### Running locally

1. **Create an Upstox API app**  
   Create a regular Upstox API app in the [Upstox developer portal](https://account.upstox.com/developer/apps) (Apps → My apps → + New App). Set the **Redirect URL** to:
   ```
   http://localhost:8787/callback
   ```

2. **Configure credentials**  
   Create a file named `.dev.vars` in the project root and add your API key (Client ID) and Client Secret:
   ```
   UPSTOX_CLIENT_ID=your_app_api_key
   UPSTOX_CLIENT_SECRET=your_app_api_secret
   ```

3. **Start the application**
   ```bash
   npm start
   ```

Your MCP server will be running at `http://localhost:8787`.

### Run the Server

To start the MCP server (after completing the steps above):
```bash
npm run start
```

## MCP Configuration

### Claude Desktop Configuration

To use this MCP server with Claude Desktop, add the following configuration to your Claude Desktop settings:

```json
{
  "mcpServers": {
    "mcp-server-upstox-api": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://localhost:8787/mcp"
      ]
    }
  }
}
```

### Cursor MCP Configuration

To use this MCP server with Cursor, add the following configuration to your Cursor MCP settings (usually located at `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "mcp-server-upstox-api": {
      "url": "http://localhost:8787/mcp"
    }
  }
}
```

These configurations allow Claude Desktop and Cursor to connect to your local MCP server and use the Upstox API endpoints.

## Using with Claude and Cursor

You can interact with the Upstox API through natural language prompts. Here are some example prompts for each command:

### Profile Information
- "What's my Upstox profile information?"
- "Show me my active segments and products in Upstox"
- "What's my user ID and email in Upstox?"

### Funds and Margin
- "What's my available margin in Upstox?"
- "Show me my equity segment funds and margin details"
- "What's my commodity segment margin availability?"

### Holdings
- "What stocks do I currently hold in Upstox?"
- "Show me my long-term holdings with their current values"
- "What's the total value of my holdings in Upstox?"

### Positions
- "What are my current open positions in Upstox?"
- "Show me my intraday positions with their P&L"
- "What's my total unrealized P&L from current positions?"

### MTF Positions
- "What are my Margin Trade Funding positions?"
- "Show me my MTF positions with their current values"
- "What's the total MTF exposure in my account?"

### Order Book
- "Show me my current day's orders in Upstox"
- "What are my pending orders in Upstox?"
- "Show me my order history for today"
- "What's the status of my recent orders?"
- "List all my completed orders for today"

### Order Details
- "Show me the details of order ID xxxxxxxxxxxxxxx"
- "What's the status of my order with ID xxxxxxxxxxxxxxx"
- "Get the complete information for order xxxxxxxxxxxxxxx"
- "Check the execution status of order xxxxxxxxxxxxxxx"
- "View the details of my recent order xxxxxxxxxxxxxxx"

### Order History
- "Show me the history of order ID xxxxxxxxxxxxxxx"
- "Get all status updates for order xxxxxxxxxxxxxxx"
- "What's the progression of order xxxxxxxxxxxxxxx"
- "Show me all stages of order xxxxxxxxxxxxxxx"
- "Get order history for tag xxxxxxxxxxxxxxx"

### Order Trades
- "Show me the trades for order ID xxxxxxxxxxxxxxx"
- "What trades were executed for order xxxxxxxxxxxxxxx"
- "Get the trade details for my order xxxxxxxxxxxxxxx"
- "List all trades associated with order xxxxxxxxxxxxxxx"
- "Show me the execution details for order xxxxxxxxxxxxxxx"

### Trades
- "Show me my trades for today"
- "What trades have I executed today?"
- "Get my daily trade history"
- "List all my completed trades for the day"
- "Show me my trade details with execution prices"

### IPOs
- "Which IPOs are open right now?"
- "Show me the upcoming SME IPOs"
- "List the IPOs that were listed recently"
- "What's the subscription level on the currently open IPOs?"
- "Show me the next 10 open mainboard IPOs"

### IPO Details
- "Show me the details of the IPO xxxxxxxxxxxxxxx"
- "What's the lot size and minimum quantity for IPO xxxxxxxxxxxxxxx"
- "When is the allotment and listing date for IPO xxxxxxxxxxxxxxx"
- "Who is the registrar for IPO xxxxxxxxxxxxxxx"
- "Give me the price band and cut-off price for IPO xxxxxxxxxxxxxxx"

### IPO Orders
- "What IPOs have I applied for?"
- "Show me my IPO applications and their allotment status"
- "Did I get an allotment on any of my IPO applications?"
- "What's the UPI mandate status on my IPO applications?"
- "How much money is blocked against my IPO applications?"

### IPO Order Details
- "Show me the details of my IPO application xxxxxxxxxxxxxxx"
- "What bids did I place on IPO application xxxxxxxxxxxxxxx"
- "How many units were allotted for my IPO application xxxxxxxxxxxxxxx"
- "Why was my IPO application xxxxxxxxxxxxxxx rejected?"
- "When was IPO application xxxxxxxxxxxxxxx submitted to the exchange?"

## Available Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/get-profile` | GET | Fetch user profile information |
| `/get-funds-margin` | GET | Fetch user funds and margin information. Optional segment parameter can be 'SEC' (Equity) or 'COM' (Commodity) |
| `/get-holdings` | GET | Fetch user long-term holdings information |
| `/get-positions` | GET | Fetch user short-term positions information |
| `/get-mtf-positions` | GET | Fetch user Margin Trade Funding (MTF) positions information |
| `/get-order-book` | GET | Fetch user's current day orders and their status |
| `/get-order-details` | GET | Fetch detailed information about a specific order using order ID |
| `/get-order-trades` | GET | Fetch trades executed for a specific order using order ID |
| `/get-order-history` | GET | Fetch order history using either order ID or tag |
| `/get-trades` | GET | Fetch user's trades executed for the current day |
| `/get-ipos` | GET | List publicly available IPOs. Optional filters: `status` ('open', 'closed', 'listed', 'upcoming'), `issue_type` ('regular', 'sme'), plus `page_number` and `records` (max 30) for pagination |
| `/get-ipo-details` | GET | Fetch full details of a single IPO using its IPO id, including lot size, cut-off price, prospectus links, registrar info and the allotment/listing timeline |
| `/get-ipo-orders` | GET | Fetch the user's own IPO applications with bids, allotment, UPI mandate and payment status. Optional `page_number` and `records` (max 30) for pagination |
| `/get-ipo-order-details` | GET | Fetch a single one of the user's IPO applications using its application id |



# DeFi Arbitrage Governance Platform

A comprehensive governance platform for DeFi arbitrage operations with audit trail capabilities, change request management, and compliance reporting.

## Features

- **Governance Dashboard**: Manage feature flags, configurations, and system settings
- **Change Request System**: Submit, review, and approve configuration changes
- **Audit Trail**: Complete logging of all governance actions with export capabilities
- **Role-Based Access**: Admin, Compliance Officer, Developer, and Viewer roles
- **Real-time Updates**: Live synchronization with Supabase backend

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Supabase account (for persistent storage)

### Installation

1. Clone the repository and install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
```

3. Edit `.env` with your Supabase credentials (see below)

4. Run the development server:
```bash
npm run dev
```

## Supabase Setup

### Step 1: Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click "New Project" and fill in the details
3. Wait for the project to be provisioned

### Step 2: Get Your API Credentials

1. In your Supabase dashboard, go to **Settings** > **API**
2. Copy the following values:
   - **Project URL**: `https://your-project-id.supabase.co`
   - **anon public key**: Found under "Project API keys"

### Step 3: Configure Environment Variables

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

### Step 4: Run Database Migrations

1. Go to **SQL Editor** in your Supabase dashboard
2. Open `supabase/migrations/001_create_governance_audit_logs.sql`
3. Copy and paste the SQL into the editor
4. Click "Run" to create the audit logs table

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_SUPABASE_URL` | Your Supabase project URL | Yes |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anonymous key | Yes |

## Project Structure

```
src/
├── components/
│   ├── governance/      # Governance-related components
│   │   ├── AuditLogPanel.tsx
│   │   ├── AuditLogTable.tsx
│   │   └── ...
│   └── ui/              # Reusable UI components
├── contexts/
│   ├── GovernanceContext.tsx
│   └── AppContext.tsx
├── lib/
│   ├── supabase.ts      # Supabase client
│   ├── auditService.ts  # Audit logging service
│   └── supabaseService.ts
├── types/
│   └── auditTypes.ts    # Audit type definitions
└── pages/
```

## Audit Trail System

The audit trail automatically logs:
- Change request submissions
- Approval/rejection decisions
- Feature modifications
- Role changes
- Impact assessments

### Exporting Audit Logs

1. Navigate to the **Audit Log** tab in Governance
2. Apply filters as needed (date range, category, user)
3. Click **Export CSV** or **Export JSON**

## Tech Stack

- React 18 + TypeScript
- Vite
- Tailwind CSS
- shadcn/ui components
- Supabase (PostgreSQL + Realtime)
- Lucide React icons

## License

MIT

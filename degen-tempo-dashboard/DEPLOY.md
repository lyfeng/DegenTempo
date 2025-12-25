# DegenTempo 部署指南

本指南涵盖了如何在本地运行 DegenTempo 进行开发，以及如何将其部署到生产环境。

## 前置要求

- **Node.js**: v18 或更高版本
- **包管理器**: npm, yarn, 或 pnpm
- **账户**:
  - [Alchemy](https://www.alchemy.com/) (用于智能账户 & RPC)
  - [Privy](https://privy.io/) (用于身份验证)
  - [Stripe](https://stripe.com/) (用于提现，开发环境可选)
  - [LI.FI](https://li.fi/) (用于代币交换，可选 API key 以获得更高额度)

## 本地开发

### 1. 克隆代码仓库

```bash
git clone <repository-url>
cd degen-tempo-dashboard
```

### 2. 安装依赖

```bash
npm install
# 或者
yarn install
```

### 3. 环境变量

基于 `.env.example` 在根目录创建一个 `.env` 文件。

```env
# 数据库 (本地使用 SQLite)
DATABASE_URL="file:./dev.db"

# 身份验证 (Privy)
NEXT_PUBLIC_PRIVY_APP_ID="your_privy_app_id"
PRIVY_APP_SECRET="your_privy_secret"

# 区块链 (Alchemy)
NEXT_PUBLIC_ALCHEMY_API_KEY="your_alchemy_api_key"
NEXT_PUBLIC_ALCHEMY_GAS_POLICY_ID="your_gas_policy_id" # 用于 Gas 管理器

# 支付 (Stripe) - 本地可选
STRIPE_SECRET_KEY="sk_test_..."
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_..."

# 代币交换 (LI.FI) - 可选
NEXT_PUBLIC_LIFI_API_KEY="your_lifi_key"
```

### 4. 数据库设置

使用 Prisma 初始化 SQLite 数据库。

```bash
npx prisma db push
```

### 5. 启动开发服务器

```bash
npm run dev
```

应用将在 `http://localhost:3000` 上可用。

---

## 生产环境部署

我们推荐使用 [Vercel](https://vercel.com) 托管 Next.js 应用，并使用托管的 PostgreSQL 数据库 (例如 Vercel Postgres, Supabase, 或 Neon)。

### 1. 数据库迁移 (PostgreSQL)

对于生产环境，将 `prisma/schema.prisma` 中的 `provider` 切换为 `postgresql`。

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

然后，生成客户端并将 schema 推送到你的生产数据库：

```bash
# 设置 DATABASE_URL 为你的生产 Postgres 连接字符串
npx prisma db push
```

### 2. 部署到 Vercel

1.  将代码推送到 Git 仓库 (GitHub/GitLab)。
2.  在 Vercel 中导入项目。
3.  在 Vercel 仪表板中配置 **Environment Variables (环境变量)**：
    - `DATABASE_URL`: 你的 Postgres 连接字符串。
    - `NEXT_PUBLIC_PRIVY_APP_ID` & `PRIVY_APP_SECRET`
    - `NEXT_PUBLIC_ALCHEMY_API_KEY` & `NEXT_PUBLIC_ALCHEMY_GAS_POLICY_ID`
    - `STRIPE_SECRET_KEY` (如果使用提现功能)
4.  点击 Deploy (部署)。

### 3. Alchemy & Paymaster 配置

1.  前往 [Alchemy Dashboard](https://dashboard.alchemy.com/)。
2.  在 **Base Mainnet** (或用于测试的 Base Sepolia) 上创建一个新 App。
3.  为你的 App 启用 **Gas Manager**。
4.  创建一个 **Gas Policy** (例如 "Sponsorship Policy") 并复制 `Policy ID`。
5.  将 `Policy ID` 添加到环境变量 `NEXT_PUBLIC_ALCHEMY_GAS_POLICY_ID` 中。
6.  确保你的策略允许你使用的方法 (通常是 `eth_sendUserOperation`)。

### 4. Privy 配置

1.  前往 [Privy Dashboard](https://dashboard.privy.io/)。
2.  配置允许的域名 (添加你的 Vercel 部署 URL)。
3.  启用 "Farcaster" 作为登录方式。

## 验证

部署完成后：
1.  **登录**: 尝试使用 Farcaster 登录。
2.  **智能账户**: 检查是否生成了智能账户地址。
3.  **交换**: 尝试进行小额交换 (或模拟交换)。
4.  **历史记录**: 检查 "History" 标签页，查看交易是否被记录。

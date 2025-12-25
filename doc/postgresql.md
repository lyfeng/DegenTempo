# PostgreSQL 本地开发“无脑”操作指南 (Mac)

这份文档旨在帮助你在 Mac 上从零开始安装 PostgreSQL，连接项目并初始化数据库表结构。

---

## 第一步：安装与启动 PostgreSQL

打开你的终端 (Terminal) 或 IDE 的终端，执行以下命令：

### 1. 使用 Homebrew 安装
如果你还没安装 Homebrew，请先自行搜索安装。

```bash
brew install postgresql@16
```
*(注：安装 `@14` 或 `@16` 版本均可，通常推荐 14+)*

### 2. 将 PostgreSQL 添加到环境变量 (可选，但推荐)
如果不执行这一步，可能找不到 `psql` 命令。根据你的终端提示，可能需要执行类似以下的命令（brew 安装完通常会提示）：
```bash
echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### 3. 启动数据库服务
```bash
brew services start postgresql@16
```
*看到 `Successfully started...` 字样即表示成功。*

---

## 第二步：创建数据库

我们需要创建一个专门给 DegenTempo 项目用的数据库。

### 1. 进入 Postgres 命令行
默认情况下，Mac 安装的 Postgres 会创建一个与你系统用户名相同的超级用户，且没有密码。
```bash
psql postgres
```

### 2. 创建数据库和用户
在 `postgres=#` 提示符下，复制粘贴以下 SQL 语句（**注意分号**）：

```sql
-- 1. 创建用户 (用户名为 degen，密码为 degen123，你可以自己改)
CREATE USER degen WITH PASSWORD 'degen123';

-- 2. 赋予该用户创建数据库的权限
ALTER USER degen CREATEDB;

-- 3. 创建数据库 (数据库名为 degen_tempo_db)
CREATE DATABASE degen_tempo_db OWNER degen;

-- 4. 退出
\q
```

---

## 第三步：配置项目环境变量

回到你的代码编辑器 (VS Code / Trae)。

### 1. 打开环境变量文件
找到 `degen-tempo-dashboard` 目录下的 `.env` 文件（如果没有，复制 `.env.example` 改名为 `.env`）。

### 2. 修改 DATABASE_URL
将 `DATABASE_URL` 修改为连接本地刚刚创建的数据库：

```env
# 格式: postgresql://用户名:密码@localhost:5432/数据库名
DATABASE_URL="postgresql://degen:degen123@localhost:5432/degen_tempo_db"
```

---

## 第四步：初始化表结构

现在我们要把代码里定义的表结构 (Schema) 同步到数据库中。

### 1. 进入项目目录
确保终端当前在 `degen-tempo-dashboard` 目录下：
```bash
cd degen-tempo-dashboard
```

### 2. 推送表结构
运行 Prisma 命令，自动在数据库里建表：
```bash
npx prisma db push
```

*如果看到 `🚀  Your database is now in sync with your Prisma schema.`，说明成功了！*

---

## 第五步：验证与查看数据

### 1. 使用可视化工具查看
Prisma 自带了一个网页版数据库管理工具，非常方便。
```bash
npx prisma studio
```
运行后，浏览器会自动打开 `http://localhost:5555`，你可以在这里直接查看 `User` 和 `Transaction` 表，甚至可以手动添加/修改数据。

---

## 常用命令速查

| 目标 | 命令 | 备注 |
| :--- | :--- | :--- |
| **启动数据库** | `brew services start postgresql@14` | 电脑重启后通常需要运行 |
| **停止数据库** | `brew services stop postgresql@14` | |
| **同步表结构** | `npx prisma db push` | 修改了 schema.prisma 后运行 |
| **查看数据** | `npx prisma studio` | 网页版管理后台 |
| **生成 Client** | `npx prisma generate` | 如果代码里提示找不到字段，运行这个 |

---

## 常见问题 (FAQ)

**Q: 报错 `psql: command not found`?**
A: 说明 PostgreSQL 的 bin 目录没加到 PATH 里。可以直接用绝对路径运行，或者重新检查第一步。

**Q: 报错 `Connection refused`?**
A: 检查数据库服务有没有启动 (`brew services list`)。

**Q: 报错 `Authentication failed`?**
A: 检查 `.env` 里的用户名和密码是否和第二步创建的一致。

# 🤖 AgentForge - AI Coding Orchestrator

**AgentForge** adalah sistem multi-agent pipeline lokal yang dirancang untuk membantu developer dalam proses coding dengan menggunakan AI. Sistem ini menggunakan arsitektur modular dengan beberapa agent khusus yang bekerja sama untuk merencanakan, mengimplementasikan, dan mereview kode secara otomatis.

## 📋 Daftar Isi

- [Fitur Utama](#-fitur-utama)
- [Arsitektur](#-arsitektur)
- [Teknologi](#-teknologi)
- [Instalasi](#-instalasi)
- [Penggunaan](#-penggunaan)
- [Konfigurasi](#-konfigurasi)
- [Struktur Project](#-struktur-project)
- [API Documentation](#-api-documentation)
- [Development](#-development)
- [Kontribusi](#-kontribusi)
- [Lisensi](#-lisensi)

## ✨ Fitur Utama

### 🎯 Multi-Agent System
- **Planner Agent**: Menganalisis task dan membuat rencana subtask yang terstruktur
- **Coder Agent**: Mengimplementasikan kode berdasarkan rencana yang dibuat
- **Reviewer Agent**: Mereview kode yang dihasilkan untuk memastikan kualitas

### 🔄 Pipeline Orchestration
- Manajemen pipeline otomatis dengan stage transitions
- Event-driven architecture untuk real-time updates
- Support untuk parallel dan sequential task execution

### 📁 File Management
- Operasi file yang aman (create, modify, delete)
- Diff engine untuk tracking perubahan
- File tree visualization
- Automatic backup sebelum modifikasi

### 🔀 Git Integration
- Git status monitoring
- Automatic commit dengan pesan yang descriptive
- Push ke remote repository
- Git history tracking

### 🧠 Context-Aware
- Project scanner untuk mendeteksi framework dan struktur
- Context resolver untuk menemukan file yang relevan
- Framework detection (React, Vue, Svelte, Next.js, dll)
- Language detection otomatis

### 🎨 Modern UI
- Web-based interface dengan SvelteKit
- Real-time updates via WebSocket
- Drag-and-drop task management
- Code diff viewer dengan syntax highlighting
- Responsive design dengan Tailwind CSS

### 🤖 Multi-Provider AI Support
- OpenAI (GPT-4, GPT-3.5)
- Anthropic (Claude)
- OpenRouter (akses ke berbagai model)
- Konfigurasi model per-agent

### 💾 Database & State Management
- SQLite database dengan Drizzle ORM
- Task management dengan subtask support
- File operation history
- Project configuration storage

## 🏗️ Arsitektur

```
┌─────────────────────────────────────────────────────────┐
│                      CLI Interface                       │
│                    (Commander.js)                        │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                   Web Server (Hono)                      │
│              REST API + WebSocket Server                 │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                    Orchestrator                          │
│              Pipeline & Event Management                 │
└─────┬──────────────┬──────────────┬─────────────────────┘
      │              │              │
┌─────▼─────┐  ┌────▼─────┐  ┌─────▼──────┐
│  Planner  │  │  Coder   │  │  Reviewer  │
│   Agent   │  │  Agent   │  │   Agent    │
└─────┬─────┘  └────┬─────┘  └─────┬──────┘
      │              │              │
      └──────────────┴──────────────┘
                     │
      ┌──────────────┴──────────────┐
      │                             │
┌─────▼──────┐              ┌──────▼──────┐
│   Task     │              │    File     │
│  Manager   │              │   Manager   │
└────────────┘              └─────────────┘
      │                             │
┌─────▼──────┐              ┌──────▼──────┐
│  Database  │              │     Git     │
│  (SQLite)  │              │   Manager   │
└────────────┘              └─────────────┘
```

## 🛠️ Teknologi

### Core
- **Runtime**: Bun (fast JavaScript runtime)
- **Language**: TypeScript
- **Database**: SQLite + Drizzle ORM
- **AI SDK**: Vercel AI SDK

### Backend
- **Server**: Hono (lightweight web framework)
- **WebSocket**: @hono/node-ws
- **Validation**: Zod

### Frontend
- **Framework**: SvelteKit 5
- **Styling**: Tailwind CSS 4
- **Build Tool**: Vite
- **UI Components**: 
  - svelte-dnd-action (drag & drop)
  - diff2html (code diff viewer)

### CLI
- **Commander.js**: CLI framework
- **Chalk**: Terminal styling
- **Ora**: Loading spinners

### AI Providers
- **@ai-sdk/openai**: OpenAI integration
- **@ai-sdk/anthropic**: Anthropic Claude integration
- **@openrouter/ai-sdk-provider**: OpenRouter integration

## 📦 Instalasi

### Prerequisites
- Node.js >= 18.0.0
- Bun (recommended) atau npm/yarn
- Git

### Install Bun (jika belum ada)
```bash
curl -fsSL https://bun.sh/install | bash
```

### Clone Repository
```bash
git clone https://github.com/MrPinguiiin/AgentForge.git
cd AgentForge
```

### Install Dependencies
```bash
bun install
```

### Build Project
```bash
bun run build
```

### Setup Database
```bash
bun run db:generate
bun run db:migrate
```

## 🚀 Penggunaan

### 1. Initialize Project
```bash
bun run ai-coder init
# atau dengan options
bun run ai-coder init --name "My Project" --path /path/to/project
```

### 2. Configure AI Provider
```bash
bun run ai-coder config --show
```

Edit file konfigurasi `.ai-coder/config.json`:
```json
{
  "providers": [
    {
      "name": "openai",
      "apiKey": "your-api-key",
      "baseURL": "https://api.openai.com/v1"
    }
  ],
  "agents": {
    "planner": {
      "provider": "openai",
      "model": "gpt-4"
    },
    "coder": {
      "provider": "openai",
      "model": "gpt-4"
    },
    "reviewer": {
      "provider": "openai",
      "model": "gpt-3.5-turbo"
    }
  }
}
```

### 3. Start Server
```bash
bun run ai-coder start
# atau dengan custom port
bun run ai-coder start --port 8080
```

Server akan berjalan di `http://localhost:3000` dan browser akan terbuka otomatis.

### 4. Gunakan Web Interface
1. Buat task baru dengan deskripsi yang jelas
2. Klik "Plan" untuk membuat subtask otomatis
3. Klik "Code" untuk mengimplementasikan
4. Review hasil dan approve/reject
5. Commit dan push ke Git

## ⚙️ Konfigurasi

### AI Provider Configuration

#### OpenAI
```json
{
  "name": "openai",
  "apiKey": "sk-...",
  "baseURL": "https://api.openai.com/v1"
}
```

#### Anthropic Claude
```json
{
  "name": "anthropic",
  "apiKey": "sk-ant-...",
  "baseURL": "https://api.anthropic.com"
}
```

#### OpenRouter
```json
{
  "name": "openrouter",
  "apiKey": "sk-or-...",
  "baseURL": "https://openrouter.ai/api/v1"
}
```

### Agent Model Configuration
Setiap agent dapat dikonfigurasi dengan provider dan model yang berbeda:

```json
{
  "agents": {
    "planner": {
      "provider": "anthropic",
      "model": "claude-3-opus-20240229",
      "temperature": 0.7
    },
    "coder": {
      "provider": "openai",
      "model": "gpt-4-turbo-preview",
      "temperature": 0.3
    },
    "reviewer": {
      "provider": "openai",
      "model": "gpt-3.5-turbo",
      "temperature": 0.5
    }
  }
}
```

### Context Configuration
```json
{
  "context": {
    "maxFiles": 50,
    "maxFileSize": 102400,
    "excludePatterns": [
      "node_modules/**",
      "dist/**",
      "*.log"
    ]
  }
}
```

## 📂 Struktur Project

```
AgentForge/
├── cli/                          # CLI application
│   ├── src/
│   │   ├── commands/            # CLI commands
│   │   │   ├── init.ts         # Initialize project
│   │   │   ├── start.ts        # Start server
│   │   │   └── config.ts       # Configuration
│   │   └── index.ts            # CLI entry point
│   └── package.json
│
├── packages/
│   ├── core/                    # Core library
│   │   ├── src/
│   │   │   ├── agents/         # AI Agents
│   │   │   │   ├── base-agent.ts
│   │   │   │   ├── planner.ts
│   │   │   │   ├── coder.ts
│   │   │   │   └── reviewer.ts
│   │   │   ├── ai/             # AI integration
│   │   │   │   ├── provider.ts
│   │   │   │   ├── models.ts
│   │   │   │   └── prompts/
│   │   │   ├── context/        # Context management
│   │   │   │   ├── scanner.ts
│   │   │   │   └── resolver.ts
│   │   │   ├── db/             # Database
│   │   │   │   ├── schema.ts
│   │   │   │   └── client.ts
│   │   │   ├── file-manager/   # File operations
│   │   │   │   ├── file-manager.ts
│   │   │   │   └── diff-engine.ts
│   │   │   ├── git-manager/    # Git operations
│   │   │   │   └── git-manager.ts
│   │   │   ├── orchestrator/   # Pipeline orchestration
│   │   │   │   ├── orchestrator.ts
│   │   │   │   ├── pipeline.ts
│   │   │   │   └── events.ts
│   │   │   └── task-manager/   # Task management
│   │   │       └── task-manager.ts
│   │   └── package.json
│   │
│   ├── server/                  # API Server
│   │   ├── src/
│   │   │   ├── routes/         # API routes
│   │   │   ├── websocket/      # WebSocket handlers
│   │   │   └── index.ts        # Server entry point
│   │   └── package.json
│   │
│   └── ui/                      # Web Interface
│       ├── src/
│       │   ├── routes/         # SvelteKit routes
│       │   ├── lib/            # Components & utilities
│       │   └── app.html
│       └── package.json
│
├── config/                      # Shared configuration
│   └── schema.ts
│
├── .gitignore
├── package.json                 # Root package.json
├── tsconfig.base.json          # Base TypeScript config
└── README.md
```

## 📡 API Documentation

### REST API Endpoints

#### Tasks
- `GET /api/tasks` - Get all tasks
- `POST /api/tasks` - Create new task
- `GET /api/tasks/:id` - Get task by ID
- `PATCH /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task
- `POST /api/tasks/:id/move` - Move task to different parent
- `POST /api/tasks/:id/reorder` - Reorder task

#### Pipeline
- `POST /api/pipeline/plan/:taskId` - Run planner agent
- `POST /api/pipeline/code/:taskId` - Run coder agent
- `POST /api/pipeline/review/:taskId` - Run reviewer agent
- `POST /api/pipeline/apply/:taskId` - Apply changes
- `POST /api/pipeline/commit/:taskId` - Commit changes

#### Files
- `GET /api/files/tree` - Get file tree
- `GET /api/files/content` - Get file content
- `GET /api/files/diff/:taskId` - Get task file diffs

#### Git
- `GET /api/git/status` - Get git status
- `GET /api/git/log` - Get git log
- `POST /api/git/commit` - Create commit
- `POST /api/git/push` - Push to remote

#### Context
- `GET /api/context/scan` - Scan project context
- `POST /api/context/resolve` - Resolve relevant files

#### Configuration
- `GET /api/config` - Get configuration
- `PUT /api/config` - Update configuration

### WebSocket Events

#### Client → Server
- `subscribe:task` - Subscribe to task updates
- `subscribe:pipeline` - Subscribe to pipeline events
- `unsubscribe:task` - Unsubscribe from task
- `unsubscribe:pipeline` - Unsubscribe from pipeline

#### Server → Client
- `task:updated` - Task was updated
- `task:deleted` - Task was deleted
- `pipeline:stage_changed` - Pipeline stage changed
- `pipeline:stream` - Agent streaming output
- `pipeline:completed` - Pipeline stage completed
- `pipeline:error` - Pipeline error occurred

## 🔧 Development

### Development Mode
```bash
# Run all packages in dev mode
bun run dev

# Run specific package
bun run --filter @ai-coder/core dev
bun run --filter @ai-coder/server dev
bun run --filter @ai-coder/ui dev
```

### Build
```bash
# Build all packages
bun run build

# Build specific package
bun run build:core
bun run build:server
bun run build:ui
bun run build:cli
```

### Testing
```bash
# Run all tests
bun run test

# Run tests for specific package
bun run --filter @ai-coder/core test
```

### Database Management
```bash
# Generate migration
bun run db:generate

# Run migration
bun run db:migrate
```

### Clean Build
```bash
bun run clean
```

## 🎯 Use Cases

### 1. Feature Development
```
1. Create task: "Add user authentication"
2. Planner creates subtasks:
   - Create auth service
   - Add login component
   - Add registration component
   - Add protected routes
3. Coder implements each subtask
4. Reviewer checks code quality
5. Apply and commit changes
```

### 2. Bug Fixing
```
1. Create task: "Fix memory leak in data fetching"
2. Planner analyzes and creates plan
3. Coder implements fix
4. Reviewer validates the fix
5. Apply and commit
```

### 3. Refactoring
```
1. Create task: "Refactor API client to use TypeScript"
2. Planner breaks down into steps
3. Coder refactors code
4. Reviewer ensures no breaking changes
5. Apply and commit
```

## 🤝 Kontribusi

Kontribusi sangat diterima! Silakan ikuti langkah berikut:

1. Fork repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

### Guidelines
- Gunakan TypeScript untuk semua kode baru
- Tambahkan tests untuk fitur baru
- Update dokumentasi jika diperlukan
- Follow existing code style
- Write clear commit messages

## 📝 Roadmap

- [ ] Support untuk lebih banyak AI providers (Google Gemini, Cohere, dll)
- [ ] Plugin system untuk custom agents
- [ ] Code review dengan multiple reviewers
- [ ] Integration dengan CI/CD
- [ ] Support untuk remote collaboration
- [ ] Advanced context management dengan vector database
- [ ] Code generation templates
- [ ] Performance monitoring dan analytics
- [ ] Multi-language support untuk UI
- [ ] Mobile app

## 🐛 Known Issues

- WebSocket reconnection perlu improvement
- Large file handling bisa lambat
- Git operations belum support semua edge cases

## 📄 Lisensi

MIT License - lihat file [LICENSE](LICENSE) untuk detail.

## 👥 Authors

- **MrPinguiiin** - [GitHub](https://github.com/MrPinguiiin)

## 🙏 Acknowledgments

- [Vercel AI SDK](https://sdk.vercel.ai/) untuk AI integration
- [Hono](https://hono.dev/) untuk web framework
- [SvelteKit](https://kit.svelte.dev/) untuk UI framework
- [Drizzle ORM](https://orm.drizzle.team/) untuk database
- [Bun](https://bun.sh/) untuk runtime

## 📞 Support

Jika Anda menemukan bug atau memiliki pertanyaan:
- Open an issue di [GitHub Issues](https://github.com/MrPinguiiin/AgentForge/issues)
- Diskusi di [GitHub Discussions](https://github.com/MrPinguiiin/AgentForge/discussions)

---

**Made with ❤️ by MrPinguiiin**

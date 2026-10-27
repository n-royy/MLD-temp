# Hướng dẫn setup máy thi MLD (từ máy trắng đến vào trận)

Mục tiêu: một teammate lấy repo này về, làm theo từ trên xuống, và vào được trận (practice hoặc chính thức)
bằng pack hiện tại. Mọi lệnh chạy trên Windows 11, PowerShell. Không có bước nào cần sửa code.

Thời gian ước tính lần đầu: 45–60 phút (phần lớn là tải và cài).

## 0. Thông tin cần có trước (BTC gửi qua email cho đội trưởng)

| Thứ | Dùng ở đâu |
|---|---|
| Game Master URL `https://masterthemachine.tech` | form Initialize của Player |
| Team ID `MLD`, Team name `Megalodon` | đã ghi sẵn trong pack (`team-pack-info.json`) |
| Tài khoản portal (`MLD_digital_cuder`) + mật khẩu | form Initialize |
| Team API Key (`gm_live_…`) | form Initialize (ô "Team API Key") |
| Repo đội `https://github.com/lqdung863/mtm-mld` | agent tự clone; tài khoản GitHub của bạn phải được mời vào repo |
| Match ID (8 ký tự) | trang `/match`; practice: tự Re-match; chính thức: BTC đưa ngay trước trận |

**Không** ghi mật khẩu/API key vào file nào trong repo này. Chỉ nhập vào form của Player.

## 1. Phần mềm nền

Kiểm tra nhanh những gì đã có:

```powershell
pwsh -NoProfile -File .\tools\check-tools.ps1
```

Cài những gì còn thiếu (tất cả ở cấp user, không cần admin trừ PostgreSQL):

```powershell
# PowerShell 7 (bắt buộc, Player gọi pwsh.exe)
winget install --id Microsoft.PowerShell --exact --silent --accept-package-agreements --accept-source-agreements
# Git, Node.js 24 LTS (nếu chưa có)
winget install --id Git.Git --exact --silent --accept-package-agreements --accept-source-agreements
winget install --id OpenJS.NodeJS.LTS --exact --silent --accept-package-agreements --accept-source-agreements
# pnpm qua corepack (shim trong %APPDATA%\npm; version thật theo packageManager của từng đề)
corepack enable pnpm --install-directory "$env:APPDATA\npm"
corepack prepare pnpm@10.12.3 --activate
# .NET SDK 8 (cấp user)
Invoke-WebRequest https://dot.net/v1/dotnet-install.ps1 -OutFile "$env:TEMP\dotnet-install.ps1"
pwsh -NoProfile -ExecutionPolicy Bypass -File "$env:TEMP\dotnet-install.ps1" -Channel 8.0 -InstallDir "$env:LOCALAPPDATA\Microsoft\dotnet" -NoPath
# JDK 21 (Temurin) + Maven: tải zip từ adoptium.net và maven.apache.org, giải nén vào %LOCALAPPDATA%\Programs\
```

Sau khi cài .NET/JDK/Maven, đặt biến môi trường **user**: `DOTNET_ROOT`, `JAVA_HOME`, `MAVEN_HOME`, và thêm các
thư mục `bin` vào PATH user. Mở PowerShell mới và chạy lại `check-tools.ps1` cho đến khi mọi dòng đều có version.

**Codex CLI**: cài theo hướng dẫn của OpenAI, đăng nhập bằng tài khoản sẽ chịu credit cho trận:

```powershell
codex login
codex login status
node .\tools\codex-account.mjs "$env:USERPROFILE\.codex\auth.json"   # in email + gói, không in token
```

Tài khoản phải đủ hạn mức cho 60 phút liên tục (xem mục 8). Gói ChatGPT Plus đã chết giữa trận ở lần practice 3.

## 2. Cổng 54321 của Player

Player chỉ chạy ở `127.0.0.1:54321`. Trên nhiều máy Windows, dải cổng này bị Hyper-V/WSL giữ chỗ. Kiểm tra:

```powershell
node -e "require('net').createServer().on('error',e=>console.log('54321:',e.code)).listen(54321,'127.0.0.1',function(){console.log('54321: free');this.close()})"
```

Nếu in `EACCES`, chạy **PowerShell Run as Administrator** (một lần, có tác dụng lâu dài):

```powershell
net stop winnat
netsh int ipv4 add excludedportrange protocol=tcp startport=54321 numberofports=1 store=persistent
net start winnat
```

## 3. MTM Player của BTC

1. Tải bản mới nhất ở `https://masterthemachine.tech/team-pack/` (đăng nhập portal rồi vào Docs, hoặc tải thẳng
   `mtm-player-<version>-local-windows.zip`). Đang dùng **0.9.35**. Khi BTC đổi bản, bản cũ bị gỡ và poll trạng
   thái trận sẽ báo `MATCH_STATUS_AUTH_REJECTED` → phải nâng cấp.
2. Giải nén vào thư mục riêng theo version: `D:\mtm\MTM-PLAYER\mtm-player-app-<version>\` (gồm `mtm-player.exe`, `app\`).
3. Tải `node.exe` v24 (x64) từ `https://nodejs.org/dist/v24.12.0/win-x64/node.exe`, kiểm SHA-256 với
   `https://nodejs.org/dist/v24.12.0/SHASUMS256.txt`, đặt cạnh `mtm-player.exe`.
4. Không trộn `app\` hay `node.exe` giữa các version. Tắt Player bằng nút trong `/manage`, không kill process.

## 4. Lấy harness và cài pack vào workspace

```powershell
git clone <đường dẫn repo harness này> D:\mtm\harness
pwsh -NoProfile -File D:\mtm\harness\team-pack\install.ps1 -TeamWorkspace "D:\mtm\MLD"
node D:\mtm\harness\team-pack\scripts\check-distribution.mjs --team-workspace "D:\mtm\MLD"
```

Checker phải in `"status":"READY"` với teamId `MLD`. Kiểm bằng chính code của Player (kết quả phải là `VERIFIED`):

```powershell
node D:\mtm\harness\tools\verify-pack.mjs "D:\mtm\MTM-PLAYER\mtm-player-app-<version>\app" "D:\mtm\MLD"
```

Workspace sau khi cài:

```
D:\mtm\MLD\
  .mtm\  .codex\  .agents\        đăng ký cho Player và Codex (do installer tạo)
  team-sdlc-pack\runtime\         bản pack đã cài (không sửa ở đây)
  team-sdlc-pack\logs\            progress log từng trận
  matches\<MatchID>\<MatchID>\    checkout của từng trận (agent tự clone)
  .mtm-local\                     mật khẩu DB cục bộ (mục 6), không commit
```

Mỗi lần sửa pack trong repo: chạy lại `install.ps1`. **Không cài lại khi trận đang chạy.**

## 5. Cho Codex tin workspace

Codex chỉ đọc `.codex/config.toml` của workspace (nơi khai báo helper `mtm_helper`, tắt plugin/MCP cá nhân, model
`gpt-6.1-sol` effort low) khi thư mục được trust. Thêm vào cuối `%USERPROFILE%\.codex\config.toml`:

```toml
[projects.'d:\mtm\mld']
trust_level = "trusted"
```

Kiểm: `cd D:\mtm\MLD; codex mcp list` phải có `mtm_helper enabled` và các MCP cá nhân ở trạng thái `disabled`.

## 6. Môi trường cho đề (hiện là Solova: Next.js + Prisma + PostgreSQL)

Agent tự cài dependency của đề, nhưng PostgreSQL là Windows service nên cài sẵn (cần UAC một lần):

```powershell
pwsh -NoProfile -File D:\mtm\harness\tools\install-postgres.ps1 -TeamWorkspace "D:\mtm\MLD"
```

Script cài PostgreSQL 16 ở cổng **5433** (cổng đề yêu cầu), sinh mật khẩu ngẫu nhiên vào `D:\mtm\MLD\.mtm-local\postgres.json`.
Sau đó tạo role/database của đề bằng file SQL của đề (lấy từ repo đội, thư mục `env-require`):

```powershell
pwsh -NoProfile -File D:\mtm\harness\tools\db-setup.ps1 -TeamWorkspace "D:\mtm\MLD" -SqlFile "<repo>\<MatchID>\env-require\db-setup.sql"
```

Dòng cuối phải là `freelanceos | f | t | t`. Script cũng ghi `.mtm-local\README.md` để agent biết cổng và nơi lấy
mật khẩu. Đề khác stack thì bỏ qua mục này; agent có quyền tự cài mọi thứ ở cấp user (xem skill chuẩn bị).

## 7. Vào trận

1. Mở `mtm-player.exe` (double-click, không tham số). Trình duyệt mở `http://127.0.0.1:54321/manage`.
   Kiểm `http://127.0.0.1:54321/health` phải trả `LOCAL_APP_READY`.
2. Ở `/manage`: nhập `D:\mtm\MLD` → **Load workspace** → phải hiện `Megalodon · MLD · v<pack version>`.
3. Practice: đăng nhập portal, vào `/match/<ID cũ>` bấm **Re-match** để có Match ID mới. Chính thức: dùng ID BTC đưa.
4. **Initialize match**, điền: Team ID `MLD`, account portal + mật khẩu, Match ID, Game Master URL, Team API Key,
   Approval mode **Approve for me**, Orchestrator model **gpt-6.1-sol**, Reasoning effort **Low**, giữ nguyên danh
   sách allowed models. Bấm Initialize.
5. Từ đây không chạm máy. Theo dõi:
   - dashboard của round (link trong `/manage`),
   - `https://masterthemachine.tech/match/<ID>` (backlog, trạng thái nộp) và `/spectator/<ID>`,
   - hoặc chạy watcher in từng mốc ra terminal:
     ```powershell
     node D:\mtm\harness\tools\watch-match.mjs "D:\mtm\MLD\team-sdlc-pack\logs\<ID>.progress.ndjson"
     ```
6. Agent tự làm: chuẩn bị (5 bước) → `ENVIRONMENT_READY` → Player báo PREPARED → trận IN_PROGRESS → agent đọc
   backlog, Start Work, sửa, test, nộp, chờ wave mới, cho đến khi trận FINISHED.

## 8. Sự cố và cách xử lý

| Triệu chứng | Nguyên nhân | Làm gì |
|---|---|---|
| Hộp thoại `LOCAL_APP_LISTEN_FAILED` khi mở Player | cổng 54321 bị Windows giữ | mục 2 |
| `/manage` báo `MATCH_STATUS_POLL_FAILED … MATCH_STATUS_AUTH_REJECTED`, dashboard `MATCH UNKNOWN` | Player cũ, BTC đã đổi bản | tải bản mới (mục 3), Shut down bản cũ trong `/manage`, mở bản mới; round đã Initialize sẽ tự tiếp tục |
| Agent đứng yên, Player cứ 10 phút gửi RESUME, dashboard không có việc mới | tài khoản Codex hết hạn mức (`You've hit your usage limit`) | `codex logout` → `codex login` bằng tài khoản khác → `/manage`: Stop Team Orchestrator → Resume. Luật cho phép đổi tài khoản không trừ điểm |
| Load team pack lỗi | cài thiếu / sai version | chạy lại `install.ps1` rồi checker |
| Preparation đứng mãi | agent chưa ghi `ENVIRONMENT_READY` | xem tab Transcript trên dashboard và `team-sdlc-pack\logs\<ID>.progress.ndjson` |
| Codex không thấy `mtm_helper` | workspace chưa trust | mục 5 |

Log để đọc khi có chuyện: `D:\mtm\MLD\team-sdlc-pack\logs\<ID>.progress.ndjson` (event của đội), dashboard
`<ID>.dashboard.html` cùng thư mục, session Codex `%USERPROFILE%\.codex\sessions\<ngày>\rollout-*.jsonl`.

## 9. Sau trận: gom dữ liệu và audit

Quy trình đã dùng cho 3 trận practice (kết quả trong `doc/practice-*/` và `doc/ITERATIONS.md`):

1. Tạo `doc/practice-<ID>/{logs,backlog,transcripts,code}`; copy progress log, match-status, dashboard từ
   `team-sdlc-pack\logs`, thư mục `<checkout>\.git\mtm` (đề, MVS, schema, receipt) vào `backlog/`.
2. Che credential trước khi lưu transcript: `python -I tools\redact.py <src> <dst>` cho rollout Codex (session chính
   và session guardian cùng timestamp) và transcript của Player (`%LOCALAPPDATA%\MTM PLAYER\applications\<id>\cli\<ID>\round01\`).
3. Code: `git bundle create`, `git archive` thư mục trận, `git log --stat`, `git diff <seed>..origin/main`.
4. Phân tích: `tools\check-submitted.mjs` (answer đã nộp có đúng schema), `tools\item-metrics.py` (token theo giai
   đoạn), `tools\analyze_session.py` (timeline, lệnh lỗi), `tools\waves.py` (mốc wave).
5. Ghi vòng mới vào `doc/ITERATIONS.md` theo khung 4 phần, sửa pack, nâng version ở 3 file manifest, chạy
   `node --test team-pack\tests\helper.test.mjs`, cài lại, commit.

## 10. Luật cần nhớ khi vận hành

- Từ lúc trận bắt đầu, người không chạm máy: mỗi lần vào máy trừ 50 điểm (practice không tính). Ngoại lệ duy nhất:
  đổi tài khoản Codex khi hết hạn mức.
- Mỗi item chỉ nộp một lần; helper đã khóa việc nộp trùng.
- Không sửa Player, không gọi API admin/grader, không tra web trong trận (đã tắt trong config).
- Trận chính thức: Match ID có ngay trước giờ thi, không có Re-match; chuẩn bị máy xong từ trước.

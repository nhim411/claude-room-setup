# Claude Room Setup

Đội agent ba vai trò **Supervisor / Lead / Peer** chạy bằng Claude Code trên
[Paseo](https://paseo.sh). Bạn giao mục tiêu cho Lead, Lead chia việc cho các
Peer qua Paseo và nghiệm thu, còn Supervisor theo dõi để luồng việc không bị
lệch.

```text
Paseo provider claude-<role>
  -> ~/.local/bin/claude-room <role>
       đọc ~/.config/claude-room/roles/<role>.md + common.md
       gộp vào --append-system-prompt mà Paseo truyền sẵn
  -> claude (dùng ~/.claude của bạn: auth, skill, hook, plugin giữ nguyên)
```

| Seat | Provider | Việc làm | Tool Paseo |
| --- | --- | --- | --- |
| Supervisor | `claude-supervisor` | Theo dõi workspace, chuyển ý định của Human tới Lead, phát hiện vòng bàn giao bị hở | Có |
| Lead | `claude-lead` | Quyết định kỹ thuật, giao việc có phạm vi cho Peer, chấp nhận hoặc từ chối kết quả | Có |
| Peer | `claude-peer` | Làm một outcome được giao, trả bàn giao kèm bằng chứng | Không |

Human luôn giữ quyền quyết định về mục tiêu sản phẩm, ưu tiên, chi phí, tác
động ra bên ngoài (push, deploy, gửi tin) và rủi ro không đảo ngược được.

## Cài nhanh bằng AI agent

Mở Claude Code (hoặc agent khác) trên máy cần cài, rồi gửi:

```text
Cài Claude Room cho máy này theo https://github.com/nhim411/claude-room-setup (làm theo AGENTS.md).
```

Agent sẽ kiểm tra yêu cầu, cho bạn xem kế hoạch cài, chỉ cài khi bạn đồng ý,
rồi chạy kiểm tra. Hướng dẫn cho agent nằm trong [AGENTS.md](AGENTS.md)
(`CLAUDE.md` trỏ tới file này). Muốn tự cài thì làm theo các mục dưới đây.

## Yêu cầu

- Claude Code đã đăng nhập (`claude auth status`).
- Paseo daemon (`npm i -g @getpaseo/cli`, hoặc bản Desktop).
- Python 3.9+. Trên Linux/macOS/WSL nên có `~/.local/bin` trong `PATH` (để gõ
  `claude-room` trong terminal).
- Hỗ trợ Linux, macOS, WSL và Windows. Cài trên máy có daemon Paseo sẽ chạy
  agent: Paseo Desktop trên Windows có daemon riêng (`%USERPROFILE%\.paseo`);
  nếu app đang nối tới host WSL thì cài trong WSL.

## Cài đặt

```bash
git clone https://github.com/nhim411/claude-room-setup.git && cd claude-room-setup
./install               # xem kế hoạch, chưa thay đổi gì
./install --apply       # cài đặt, backup mọi file bị thay thành *.claude-room-<thời gian>.bak
paseo daemon reload
./install --verify      # phải kết thúc bằng VERIFY_OK
```

`--verify` kiểm tra cả file đã cài lẫn daemon đang chạy: daemon phải phục vụ ba
provider `claude-*`. Daemon đang tắt có chủ đích thì dùng `--verify --offline`.

Trên Windows (PowerShell), clone vào một thư mục thường rồi chạy:

```powershell
python install            # xem kế hoạch
python install --apply
paseo daemon reload
python install --verify   # phải kết thúc bằng VERIFY_OK
```

Trên Windows, provider chạy `<python.exe> %USERPROFILE%\.local\bin\claude-room <role>`
bằng đúng Python đã chạy `python install --apply`. Khi nâng cấp hoặc gỡ Python
đó, chạy lại `python install --apply`.

Installer thêm ba provider `claude-*` và ba agent profile `Room Supervisor/Lead/Peer`
(`daemon.agentProfiles`, hiện ở mục **Profiles** của model picker) vào
`~/.paseo/config.json`, và bật `daemon.mcp.injectIntoAgents` nếu bạn chưa đặt giá trị
cho nó. Cổng, profile khác và các provider khác giữ nguyên. Chạy lại bao nhiêu lần cũng được.

Gỡ cài đặt: `./install --uninstall` để xem kế hoạch, rồi thêm `--apply` để gỡ.

## Sử dụng

1. Mở project trong Paseo và tạo workspace.
2. Tạo agent **Claude Lead** trong workspace đó. Giao một outcome rõ ràng: kết
   quả quan sát được, các ràng buộc, và những gì Lead được phép làm (ví dụ
   "được commit, không được push").
3. Lead tự tạo các **Claude Peer** qua tool Paseo, mỗi Peer một phạm vi ghi
   riêng. Peer báo `REOPEN_REQUEST`, `DEPENDENCY_REQUEST` hoặc `BLOCKED` kèm
   bằng chứng khi gặp vướng. Lead chấp nhận hoặc từ chối từng kết quả và nêu lý do.
4. Tuỳ chọn: tạo **Claude Supervisor** và yêu cầu nó giám sát workspace.
   Supervisor tạo một heartbeat 10 phút làm dự phòng và chỉ nhắn Lead khi phát
   hiện lệch thực sự.

Chế độ quyền được chọn cho từng agent trong Paseo. Phòng chạy không người trông
cần mode bypass. Nếu muốn duyệt từng lệnh, chọn mode mặc định.

Lần đầu mở một dự án, chạy onboarding (`/room-onboard-project`, hoặc nhờ agent
làm theo `~/.config/claude-room/onboard-project.md` khi máy không có skill) để tạo
`docs/WORKSPACE_PROTOCOL.md` (lệnh nghiệm thu, worktree, tài nguyên dùng chung,
việc cần Human duyệt) và duyệt bản nháp trước khi giao việc cho Lead. File này
được thêm chi tiết nhưng không được đổi quyền của các vai trò.

Hướng dẫn chi tiết và ví dụ áp dụng cho một dự án thật: [docs/huong-dan-su-dung.md](docs/huong-dan-su-dung.md).

## Tuỳ chỉnh

| Muốn đổi | Sửa trong repo | Rồi chạy |
| --- | --- | --- |
| Model / effort mặc định | `paseo/providers.json` | `./install --apply`, `paseo daemon reload` |
| Agent profile (model picker) | `paseo/profiles.json` | `./install --apply`, `paseo daemon reload` |
| Hành vi của một vai trò | `home/.config/claude-room/roles/<role>.md` | `./install --apply` |
| Ghi chú chung cho mọi seat | `home/.config/claude-room/common.md` | `./install --apply` |
| Phần ngữ cảnh nền mỗi seat nạp | `home/.config/claude-room/launch.json` | `./install --apply` |
| Hợp đồng chung của workspace | `home/.config/claude-room/WORKSPACE_PROTOCOL.md` | `./install --apply` |
| Quy trình onboarding dự án | `home/.config/claude-room/onboard-project.md` | `./install --apply` |

Model trong SLP (chọn khi tạo agent hoặc qua profile Room *; Peer do Lead tự chọn):

| Seat | Mặc định | Khi nào đổi |
| --- | --- | --- |
| Supervisor | Sonnet 5.5 Low | Medium khi giám sát nhiều workspace; Opus Low/Medium khi luồng việc rối và Sonnet bỏ sót drift |
| Lead | Opus 5.5 Medium | Low cho việc nhỏ, rõ, ít Peer; High/Extra High khi chia epic lớn, thiết kế kiến trúc, nghiệm thu thay đổi rủi ro (migration, bảo mật, tiền); Fable 5.2 hoặc Max chỉ cho phiên quyết định quan trọng, không chạy cả phiên dài |
| Peer: tra cứu thuần | Haiku 5.5 Off (Low nếu đối chiếu vài nguồn) | Tìm file/symbol, liệt kê call site, grep log, đọc config/work item rồi báo nguyên văn |
| Peer: việc cơ học | Sonnet 5.5 Low/Medium | Rename, thêm field theo mẫu, sửa doc, chạy test rồi báo kết quả |
| Peer: việc cần suy luận (mặc định) | Sonnet 5.5 High | Code, sửa bug, viết test, giải conflict, review PR, tìm nguyên nhân |
| Peer: rủi ro cao | Opus 5.5 High | Peer Sonnet đã thất bại, hoặc sai sót đắt và khó phát hiện (bảo mật, tách tenant, mất dữ liệu, migration, tiền). Việc lớn hay nhiều file không phải lý do |
| Peer: khó nhất | Opus Extra High/Max, Fable 5.2 | Chỉ sau khi Peer Opus thất bại, hoặc quyết định thiết kế rủi ro cao |

Quy tắc chung:

- Chọn tier rẻ nhất đủ cho việc, theo mức phán đoán cần có, không theo kích thước.
- Kết quả mỏng hoặc không chắc từ tier thấp thì giao lại tier cao hơn, không thử lại cùng tier.
- Mọi brief giao Peer trên Sonnet High phải có một dòng lý do.
- Model và effort mặc định nằm ở `paseo/providers.json` và `paseo/profiles.json`.

## Thiết kế

- **Prompt vai trò đi đúng đường của SDK:** Paseo chạy Claude ở chế độ
  stream-json, và system prompt nằm trong message `initialize` gửi qua stdin
  (nó đè lên cờ trên argv). Launcher chèn prompt vai trò vào message đó, đặt
  trước nội dung của Paseo. Khi chạy tay trong terminal, prompt được ghép vào
  `--append-system-prompt`.
- **Lệnh thăm dò đi thẳng:** Paseo cũng gọi chính lệnh của provider với
  `--version` và `auth status`. Các lệnh này được chuyển nguyên vẹn sang
  `claude`, vì subcommand từ chối cờ prompt.
- **Subagent có sẵn của Claude:** bị chặn ở Lead và Supervisor để mọi điều phối
  đi qua Paseo. Peer được dùng subagent chỉ đọc (như Explore) để research trong
  phạm vi của mình, giúp tiết kiệm context.
- **Hợp đồng nằm trong prompt:** vai trò + hợp đồng chung + ghi chú Claude được
  ghép sẵn vào system prompt, agent không phải tự đọc file.
- **Kiểm tra prompt thật sự được nạp:** tạo một agent `claude-peer` và hỏi
  "quote the line starting with 'Room role:'". Nếu nó trả lời ABSENT thì
  launcher chưa được dùng.
- **Chỉ Supervisor và Lead có tool Paseo:** Peer không tự tạo hay điều khiển
  agent khác được.
- **Không động vào `~/.claude`:** launcher không ghi file nào. Stdout chỉ dành
  cho stream của SDK, lỗi được in ra stderr.

## Tối ưu usage

Mỗi request của agent đều mang theo phần ngữ cảnh nền: system prompt, danh
sách skill, plugin, CLAUDE.md, MCP. Lead và Supervisor đọc lại phần này ở mỗi
lần gọi tool. Kết quả đo trên máy có nhiều skill và plugin:

| Cấu hình | Token nền |
| --- | --- |
| Claude mặc định | ~52k (~79k trong repo có nhiều rule và skill) |
| Supervisor: `settingSources: project,local` + `strictMcpConfig` | ~20k |
| Lead: giữ MCP của user (Notion, M365 chỉ đọc) | ~47k |
| Peer: giữ nguyên | ~48k |

`launch.json` chỉnh phần nền này cho từng seat:

- `settingSources` thay giá trị Paseo truyền vào. Bỏ `user` thì không nạp
  plugin, skill, hook và CLAUDE.md cấp user; skill và rule của dự án vẫn còn.
- `strictMcpConfig` chỉ giữ MCP do Paseo truyền vào, bỏ các server khác của user.

Notion và Microsoft 365 chỉ được đọc ở Lead và Peer: mọi tool gửi, trả lời,
tạo, sửa, xoá, di chuyển bị chặn cứng bằng `disallowedTools` trong
`paseo/providers.json`. Lead tự tra cứu ngắn (một trang, một thread); điều tra
dài giao cho Peer chỉ đọc để ngữ cảnh của Lead không phình ra.

Supervisor không sửa code nên cắt được nhiều nhất. Peer giữ đủ để dùng được
chrome-devtools, Playwright hay skill cá nhân khi làm việc.

Thử nghiệm A/B (cùng task, chấm bằng 9 test ẩn): Lead Opus Low và Lead Opus
Medium đều đạt 9/9, usage và thời gian gần như bằng nhau. Vì vậy mặc định
của Lead là Medium: rẻ hơn High mà vẫn giữ biên an toàn khi chia việc và nghiệm
thu, vì lỗi ở Lead nhân lên qua mọi Peer. Task A/B nhỏ nên chưa đủ để mặc định Low.

## Plugin tuỳ chọn: hộp thư notification

Notification của Paseo (agent xong việc, lỗi, cần quyền) hiện lên rồi biến
mất. Plugin [`plugins/paseo-notification-inbox`](plugins/paseo-notification-inbox/OVERVIEW.md)
ghi lại từng notification trên daemon, thêm icon chuông có số chưa đọc ở đầu
sidebar. Bấm chuông để xem lại danh sách, bấm một dòng để mở tab agent đó.
Installer không cài plugin này; cài riêng trên máy chạy daemon (cần bật
plugin trong Settings → Plugins, Paseo 0.13.0 trở lên cho cả daemon và app):

```bash
cd plugins/paseo-notification-inbox
npm install && npm run typecheck && npm test
paseo plugin install "$PWD"
```

## Gỡ lỗi

| Hiện tượng | Kiểm tra |
| --- | --- |
| Không thấy provider `claude-*`, hoặc verify báo `daemon serves claude-*` FAIL | `paseo daemon reload` (thêm `--host` nếu cần), đợi vài giây rồi `./install --verify` |
| Agent lỗi ngay khi khởi chạy | Chạy `claude-room lead -p "role?"` trong terminal; xem `claude` có trong `PATH` không, hoặc đặt `CLAUDE_BIN` |
| Lead không có tool Paseo | `daemon.mcp.injectIntoAgents` phải là `true` |
| Peer gọi được tool Paseo | `paseoTools.enabled` của `claude-peer` phải là `false` |

## Phát triển

```bash
make test     # unit test cho launcher và installer
```

Trên Windows: `python -m unittest discover -s tests`. Test launcher bị bỏ qua
vì cần script POSIX; kiểm tra launcher bằng lệnh smoke test trong `AGENTS.md`.

## License

MIT, xem [LICENSE](LICENSE).

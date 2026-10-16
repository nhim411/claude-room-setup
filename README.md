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
- Python 3.9+, `~/.local/bin` có trong `PATH`.

## Cài đặt

```bash
git clone https://github.com/nhim411/claude-room-setup.git && cd claude-room-setup
./install               # xem kế hoạch, chưa thay đổi gì
./install --apply       # cài đặt, backup mọi file bị thay thành *.claude-room-<thời gian>.bak
paseo daemon reload
./install --verify      # phải kết thúc bằng VERIFY_OK
```

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

Model mặc định và các lựa chọn khác (chọn khi tạo agent hoặc trong
agent profile của Paseo):

| Seat | Mặc định | Lựa chọn khác |
| --- | --- | --- |
| Supervisor | Opus 5.5 Low | Opus 5.5 Medium, Sonnet 5.5 Low/Medium |
| Lead | Opus 5.5 Medium | Opus 5.5 Low/High/Extra High/Max, Fable 5.1 High/Extra High, Sonnet 5.5 High/Medium |
| Peer | Sonnet 5.5 High | Sonnet 5.5 Low/Medium/Extra High, Opus 5.5 Medium/High/Extra High/Max, Fable 5.1 High/Extra High |

Khi nào dùng mức cao (Fable 5.1, Opus Extra High/Max):

- **Supervisor:** không cần. Việc của nó là đọc trạng thái và đối chiếu, Low là đủ;
  lên Medium khi giám sát nhiều workspace hoặc luồng việc rối.
- **Lead:** Medium cho việc thường ngày. Lên High/Extra High khi chia một epic
  lớn, thiết kế kiến trúc, hay nghiệm thu thay đổi rủi ro cao (migration, tiền,
  bảo mật). Fable 5.1 hoặc Max chỉ cho phiên lập kế hoạch/quyết định quan trọng,
  không để chạy cả phiên dài vì tốn usage.
- **Peer:** Lead tự chọn theo từng việc (quy tắc nằm trong prompt của Lead):
  Sonnet cho việc có phạm vi rõ, Opus High cho debug xuyên module hoặc review
  kiến trúc, Opus Extra High/Max hoặc Fable 5.1 chỉ khi Peer rẻ hơn đã thất bại
  hoặc câu hỏi root-cause/thiết kế có rủi ro cao. Lead phải ghi lý do trong brief.

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
Medium đều đạt 9/9, usage và thời gian gần như bằng nhau. Mặc định của Lead
vẫn là Medium; chọn Low cho việc nhỏ và rõ ràng.

## Gỡ lỗi

| Hiện tượng | Kiểm tra |
| --- | --- |
| Không thấy provider `claude-*` | `paseo daemon reload`; `./install --verify` |
| Agent lỗi ngay khi khởi chạy | Chạy `claude-room lead -p "role?"` trong terminal; xem `claude` có trong `PATH` không, hoặc đặt `CLAUDE_BIN` |
| Lead không có tool Paseo | `daemon.mcp.injectIntoAgents` phải là `true` |
| Peer gọi được tool Paseo | `paseoTools.enabled` của `claude-peer` phải là `false` |

## Phát triển

```bash
make test     # unit test cho launcher và installer
```

## License

MIT, xem [LICENSE](LICENSE).

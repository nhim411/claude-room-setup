# Hướng dẫn sử dụng

## Khái niệm: một phòng = một dự án

Phòng không được cài riêng cho từng dự án. Ba provider `claude-*` được cài một
lần cho cả máy. "Phòng" chỉ xuất hiện khi bạn tạo agent trong **workspace Paseo
của một dự án cụ thể**:

```text
Dự án (git repo)  ──>  Workspace Paseo (thư mục làm việc của agent)
                         ├── Claude Lead        (1 agent, điều phối dự án)
                         ├── Claude Peer  x N   (Lead tạo, mỗi Peer một việc)
                         └── Claude Supervisor  (tuỳ chọn, giám sát)
```

- Agent chạy trong thư mục của workspace nên đọc được `CLAUDE.md`, `.claude/`,
  skill và rule của dự án đó như khi bạn mở `claude` trong repo.
- Mỗi dự án có một Lead riêng. Một Supervisor có thể giám sát nhiều workspace.
- Peer nào sửa code nên chạy trong **worktree riêng** để không ghi đè lên nhau.
  Peer chỉ đọc (review, điều tra) thì chạy chung thư mục với Lead cũng được.

## Quy trình chung

1. Mở dự án trong Paseo: chọn thư mục repo trong app, hoặc `cd` vào repo rồi tạo
   agent bằng CLI (workspace mặc định là thư mục hiện tại).
2. **Lần đầu mở dự án: chạy onboarding** (xem mục bên dưới). Bước này tạo
   `docs/WORKSPACE_PROTOCOL.md` cho dự án, ghi lệnh nghiệm thu, cách tạo
   worktree, tài nguyên dùng chung và những việc cần Human duyệt. Lead sẽ không
   giao việc cho Peer khi file này chưa có và chưa được bạn duyệt.
3. Tạo **Claude Lead** và giao một outcome, không giao danh sách bước.
4. Lead điều tra repo, chia việc, tạo Peer qua tool Paseo, rồi nghiệm thu từng
   kết quả bằng ACCEPT hoặc REJECT kèm lý do.
5. Bạn chỉ trả lời khi Lead hỏi những việc thuộc quyền Human: phạm vi sản phẩm,
   push/merge/deploy, chi phí, thao tác không đảo ngược được.
6. Khi phòng chạy lâu, tạo **Claude Supervisor** để nó canh luồng làm việc.

Một outcome tốt gồm: kết quả quan sát được, ràng buộc, những gì Lead được phép
làm, và bằng chứng nghiệm thu. Ví dụ "sửa bug X, được commit trên nhánh mới,
không push, nghiệm thu bằng test + chạy lại màn hình". Không nên giao kiểu
"đọc file A, sửa hàm B".

## Onboarding dự án lần đầu

Mỗi dự án chỉ cần làm một lần, trước khi giao việc đầu tiên cho Lead.

1. Mở dự án trong Paseo (hoặc `cd` vào repo), tạo agent **Claude Lead** hoặc
   `claude` thường, rồi chạy onboarding theo một trong ba cách sau. Cả ba đều
   làm theo cùng một quy trình (`home/.config/claude-room/onboard-project.md`).

   | Máy của bạn | Cách chạy |
   | --- | --- |
   | Đã cài phòng, có skill | `/room-onboard-project` |
   | Đã cài phòng, không thấy skill (ví dụ seat không nạp skill của user) | `Làm theo ~/.config/claude-room/onboard-project.md cho dự án này` |
   | Chưa cài phòng | `Đọc và làm theo https://raw.githubusercontent.com/nhim411/claude-room-setup/main/home/.config/claude-room/onboard-project.md cho dự án này` |

   Lead không cần skill: khi thấy dự án chưa có `docs/WORKSPACE_PROTOCOL.md`,
   Lead tự đọc file quy trình trên và chạy onboarding.
2. Onboarding đọc `CLAUDE.md`, skill, Makefile/package.json, CI, quy ước branch của
   dự án, rồi soạn `docs/WORKSPACE_PROTOCOL.md` khoảng 25-40 dòng. Mục nào không
   xác nhận được sẽ ghi `unverified`, không đoán.
3. Đọc bản nháp và trả lời: sửa mục nào, mục `unverified` nào cần bạn điền.
   Lead chỉ bắt đầu giao việc sau khi bạn duyệt.
4. File này mặc định chỉ nằm trên máy bạn: onboarding thêm nó vào
   `.git/info/exclude`, không sửa `.gitignore` và không commit. Muốn chia sẻ cho
   cả nhóm thì bạn tự commit.

Chạy lại onboarding khi dự án đổi lệnh build/test, CI hoặc quy ước
branch. Khi file đã có, onboarding chỉ đề xuất phần cần sửa, không viết lại.

## Ví dụ: dự án `shop`

### 1. Chuẩn bị một lần

Chạy onboarding trong `~/workspace/shop` (xem mục Onboarding).
Sau khi bạn duyệt, `~/workspace/shop/docs/WORKSPACE_PROTOCOL.md` có dạng như
sau (file này chỉ bổ sung chi tiết, không thay đổi quyền của các vai trò):

```markdown
# Shop workspace protocol

- Nghiệm thu code: `make verify` (FE type check, lint, test, build; BE build, test) phải xanh.
  Thay đổi màn hình cần thêm bằng chứng chạy thật (Playwright e2e hoặc chạy app với dữ liệu mẫu).
- Mỗi Peer ghi code dùng worktree riêng (`git worktree add`), branch `fix/<user>/<issue>`
  hoặc `feature/<user>/<issue>`.
- Docker stack và DB local dùng chung: chỉ một Peer được chạy migration hoặc đổi DB
  tại một thời điểm, và Lead chỉ định Peer đó.
- Commit được phép trên branch của task. Push, tạo PR, cập nhật issue cần Human duyệt.
- Tài liệu thiết kế và quyết định ghi vào issue hoặc docs/ hiện có, không tạo tracker mới.
```

### 2. Giao việc cho Lead

Tạo agent trong app Paseo (chọn workspace `shop`, provider **Claude Lead**,
mode bypass), hoặc dùng CLI:

```bash
cd ~/workspace/shop
paseo run --provider claude-lead --mode bypass --title "Lead #123" \
  "Issue #123: màn hình đăng ký đơn hàng lưu sai số tiền khi có chiết khấu.
   Outcome: lưu đúng số tiền, có test bao phủ trường hợp chiết khấu.
   Được tạo branch fix/<user>/123 và commit. Không push, không tạo PR, không sửa issue.
   Nghiệm thu: make verify xanh + bằng chứng chạy lại màn hình với dữ liệu thật."
```

Lead sẽ làm các bước sau:

- Đọc protocol, đọc issue, điều tra code (có thể dùng skill debug sẵn có
  của dự án).
- Tạo Peer A sửa backend trong worktree riêng.
- Nếu cần điều tra song song thì tạo thêm Peer B (chỉ đọc), ví dụ "kiểm tra
  phía frontend có làm tròn số tiền không".
- Nhận bàn giao: commit, các file đã đổi, kết quả `make verify`, rủi ro còn lại.
- Tự kiểm tra rồi ACCEPT hoặc REJECT, sau đó báo cho bạn: điều gì đã dùng được,
  bằng chứng, giới hạn, và những việc cần bạn quyết (ví dụ "cho phép push và tạo PR?").

### 3. Theo dõi

```bash
paseo ls                     # danh sách agent: Lead và các Peer
paseo attach <lead-id>       # xem Lead đang làm gì
paseo send <lead-id> "Được phép push và tạo PR."   # cấp thêm quyền khi được hỏi
```

### 4. (Tuỳ chọn) Supervisor cho việc dài

Ví dụ một epic nhiều phần, chạy qua đêm:

```bash
paseo run --provider claude-supervisor --mode bypass --title "Supervisor shop" \
  "Giám sát workspace shop, Lead là agent <lead-id>, đang làm epic #100.
   Mục tiêu của tôi: có luồng tạo/sửa/xoá dùng được đầu-cuối, chưa cần phần báo cáo.
   Chỉ can thiệp khi luồng làm việc lệch; báo tôi khi cần quyết định."
```

Supervisor tạo heartbeat 10 phút và kiểm tra vòng "Lead giao, Peer trả, Lead
nghiệm thu". Nó chỉ nhắn Lead khi thấy vòng bị hở hoặc việc đi lệch mục tiêu,
và không tự sửa code.

Supervisor không giao việc: bạn vẫn giao outcome trực tiếp cho Lead. Giao cho
Supervisor việc giám sát không phải là giao task cho Lead.

#### Kiểm tra hành vi Supervisor

Làm lại sau khi đổi `roles/supervisor.md`, `common.md` hoặc model của
Supervisor, trên một phiên Supervisor **mới** (phiên cũ giữ prompt cũ). Test
và `--verify` chỉ chứng minh prompt được nạp, không chứng minh hành vi.

1. Giao giám sát một workspace có Lead đang làm việc bình thường. Đạt khi:
   `list_schedules` có đúng một heartbeat 10 phút của Supervisor đó, và Lead
   **không** nhận tin nhắn nào.
2. Để heartbeat chạy vài lượt khi không có gì thay đổi. Đạt khi Supervisor kết
   thúc lượt ngay, không nhắn Lead, không báo cáo lặp.
3. Tạo một lệch thật, ví dụ Peer trả `STATUS: DONE` mà Lead không ACCEPT/REJECT
   rồi giao việc phụ thuộc tiếp. Đạt khi Supervisor gửi Lead **một** câu quan sát
   kèm câu hỏi mở, không trích lời bạn, không nhắc "Human said"/"Supervisor",
   không ra lệnh thay Lead.
4. Không có bằng chứng mới. Đạt khi Supervisor không hỏi lại cùng vấn đề.
5. Bảo Supervisor dừng giám sát. Đạt khi heartbeat của nó bị xoá và schedule
   của phiên khác vẫn còn.

## Trả lời câu hỏi của Lead

Khi cần bạn quyết định (ví dụ quy tắc nghiệp vụ chưa có trong dự án), Lead hỏi
bằng câu hỏi trắc nghiệm. Câu hỏi hiện trong app Paseo như một yêu cầu cần chú
ý của agent Lead, và Lead dừng ở đó cho tới khi bạn chọn. Nếu bạn nói trước
rằng sẽ vắng mặt, Lead dừng và ghi rõ quyết định cần bạn trong báo cáo cuối.

Kết quả mỗi lượt của Lead có dạng: cái gì dùng được, `ACCEPT <sha>: <lý do>`
hoặc `REJECT ...`, bằng chứng, giới hạn, và quyết định cần bạn (merge, push...).

## Khi nào nên dùng phòng

| Việc | Cách làm |
| --- | --- |
| Bug nhỏ, một file, sửa trong 15 phút | Dùng `claude` thường, không cần phòng |
| Bug cần điều tra FE + BE + DB, hoặc feature nhiều phần | Claude Lead + Peer |
| Epic dài, chạy không người trông | Lead + Peer + Supervisor |
| Review queue PR, nhiều việc độc lập | Lead chia mỗi PR cho một Peer chỉ đọc |

## Lưu ý

- Chi phí tăng theo số agent: Lead dùng Opus High, Peer dùng Sonnet. Đổi model
  trong `paseo/providers.json` nếu cần.
- Peer không có tool Paseo nên không tự tạo agent. Nếu thấy Peer làm việc đó,
  chạy `./install --verify`.
- Đổi role hoặc protocol thì tạo lại agent; agent đang chạy giữ prompt cũ.

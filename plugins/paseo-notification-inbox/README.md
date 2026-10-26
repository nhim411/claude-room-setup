# Paseo notification inbox

Plugin Paseo lưu lại notification của agent để xem lại sau khi chúng biến mất.

## Chức năng

- Ghi lại mỗi notification khi agent **xong việc**, **lỗi** hoặc **cần quyền**,
  kể cả khi không mở app.
- Icon chuông ở đầu sidebar, hiện số notification chưa đọc.
- Bấm chuông để xem danh sách (mới nhất ở trên): tên agent, lý do, workspace,
  thời gian.
- Bấm một dòng để mở tab agent đó và đánh dấu đã đọc. Có nút
  **Mark all read** và **Clear**.
- Lịch sử giữ 300 notification gần nhất, còn nguyên sau khi reload app hoặc
  restart daemon. Dữ liệu chỉ nằm trên máy, tại
  `~/.paseo/plugin-data/paseo-notification-inbox/notifications.json`.

## Cài đặt

Yêu cầu: Paseo 0.13.0 trở lên cho cả daemon và app; đã bật plugin trong
**Settings → Plugins**.

Chạy trên máy có Paseo daemon (nếu app Windows kết nối tới WSL thì chạy trong
WSL):

```bash
paseo plugin install github:nhim411/claude-room-setup:plugins/paseo-notification-inbox
```

Reload app (Ctrl+R) để thấy icon chuông. Nếu không thấy, xem
**Settings → Plugins** có báo lỗi không, và **Settings → Sidebar** xem mục có
bị ẩn không.

Cập nhật và gỡ:

```bash
paseo plugin update paseo-notification-inbox
paseo plugin remove paseo-notification-inbox
```

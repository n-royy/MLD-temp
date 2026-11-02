# team-sdlc-pack 1.5.4: chuẩn bị nhanh (UV8P4HUS)

## Vì sao
Ở UV8P4HUS (1.5.3), phần chuẩn bị mất 26 phút (10:33 → 10:59). Lúc báo ENVIRONMENT_READY thì đồng hồ trận đã chạy.

| Nguyên nhân (đo từ transcript) | Ảnh hưởng |
|---|---|
| Scout poll log: 35/84 lượt chỉ để đọc đuôi log. Một lệnh trong code mode trả về sau khoảng 30 s dù `yield_time_ms` đặt bao nhiêu. | Khoảng 11 phút model suy nghĩ, 3,47M token input (khoảng 41k mỗi lượt) |
| Cài 4 slot, build và test baseline chạy cùng lúc; cài slot vẫn ở "added 139/360" sau 5 phút. Nghi pnpm store ở C:, workspace ở D: nên không hardlink được, phải chép toàn bộ (chưa xác nhận trên máy). | Khoảng 12 phút trên đường găng |
| READY phải chờ slot, test baseline, repo map, công cụ và bản vá cùng xong | Mọi thứ đều nằm trên đường găng |
| Bản vá baseline sửa luôn `deriveInvoiceStatus` (lỗi BTC cài cho BUG-03) | Khoảng 5 phút, và làm sai item BUG-03 |

## Thay đổi
**Helper**
- `start_jobs {dir, jobs:[{name,cwd,command}], restartFailed?}`: chạy lệnh dài dưới dạng tiến trình tách rời. Tiến trình vẫn chạy sau khi lượt Codex kết thúc. Mỗi job ghi `<name>.log` khi chạy và `<name>.exit` khi xong. Gọi lại an toàn: job đang chạy (RUNNING) hoặc đã xong (DONE) không bị chạy lại; job mất tiến trình (LOST) thì chạy lại. `dir` bắt buộc nằm trong `.mtm-tmp`. Trên Windows lệnh chạy trong pwsh, giữ PATH đang có. Thiếu shell thì job được ghi FAILED (exit 127), helper không sập.
- `wait_jobs {dir, names?, timeoutMs ≤ 280000}`: chặn ngay trong helper đến khi job xong, rồi trả trạng thái và đuôi log. Một lượt model thay cho nhiều lần poll.
- `wait_for_update` có thêm lý do **`JOBS_DONE`**: báo khi một job nền từ phần chuẩn bị (`install-sN`, `baseline`) kết thúc. Mỗi job chỉ báo một lần; job `prep-*` không báo.
- Brief của `start_work` có thêm `jobsDir`, `slotInstallJob`, `slotInstallState`. Kết quả trả về cũng có `slotInstallState`.

**Luồng chuẩn bị mới**
1. Scout phần A: job `prep-install` → chạy song song `prep-build` và `prep-db` (migrate, seed, doctor) → trả lời kèm kết quả build. Gate ENVIRONMENT và BUILD đóng ở đây.
2. `prepare_slots` (4 slot).
3. Scout phần B: **khởi động rồi không chờ** `install-s1..s4` và `baseline`. Trong lúc đó viết repo map và công cụ. Bản vá baseline (phần F) chỉ làm khi `baseline` đã xong lúc trả lời, chỉ sửa sai lệch database/migration, không bao giờ sửa logic sản phẩm, tối đa 3 phút.
4. Đăng nhập trận → báo READY.

**Trong trận**
- Orchestrator spawn worker ngay, không chờ job nền.
- Worker chờ đúng job cài slot của mình (`wait_jobs`) trước lần chạy test đầu tiên.
- Khi nhận `JOBS_DONE`:
  - job cài slot lỗi → chạy lại bằng `start_jobs restartFailed`;
  - `baseline` đỏ mà chưa có bản vá → chọn một baseline owner và nhắn cho worker đó (tin nhắn thứ ba được phép giữa lúc làm).
- Luật "dùng `yield_time_ms` lớn" (không có tác dụng) được thay bằng `start_jobs`/`wait_jobs` ở scout, worker và WORKER.md.

**Máy (`machine-setup.ps1`)**
- Đặt pnpm store **cùng ổ với workspace** (mặc định `<ổ>:\pnpm-store`, tham số `-StoreDir`). Thư mục làm ấm store cũng nằm trên ổ đó. README trong `.mtm-local` ghi lại đường dẫn store.
- Thêm loại trừ Windows Defender cho workspace, pnpm store, dữ liệu Postgres, `node.exe` và `postgres.exe`. Chỉ tự thêm khi chạy với quyền admin; nếu không thì in lệnh để chạy tay. Bỏ qua bằng `-SkipDefender`.
- ENVIRONMENT.md: mục Machine inventory sửa theo Postgres bản portable và ghi chú pnpm store.

## Kiểm thử
- `tests/jobs.test.mjs` (mới):
  - từ chối thư mục nằm ngoài `.mtm-tmp`;
  - 3 job chạy song song; `wait_jobs` trả về ngay khi xong (dưới 8 s) với DONE và FAILED (exit 3), kèm đuôi log;
  - gọi lại không chạy lại job DONE/FAILED; `restartFailed` thì chạy lại;
  - job LOST được chạy lại;
  - chờ quá giờ thì trả `done:false` với trạng thái RUNNING.

  Ngoài ra đã thử thủ công: job vẫn chạy sau khi tiến trình helper thoát. Wrapper pwsh được thử với 3 trường hợp: exit code của lệnh native, cmdlet, và lệnh throw.
- `tests/deadline.test.mjs` mở rộng: `JOBS_DONE` báo đúng `baseline` FAILED một lần, không báo `prep-build`; brief có `jobsDir`, `slotInstallJob`, `slotInstallState`.
- `helper`, `slots`, `groups`: pass.
- `check-distribution`: READY, 1.5.4, 17 tool.
- Audit cụm luật: 73/76. Ba cụm thiếu là bỏ có chủ đích, giống 1.5.3.
- `machine-setup.ps1`: parser PowerShell 7 không báo lỗi cú pháp (chưa chạy thật trên Windows).

## Chưa kiểm chứng
- Trên Windows, khi `codex exec` kết thúc lượt chuẩn bị, Codex có thể dọn luôn cây tiến trình con. Khi đó job nền mất tiến trình và được báo LOST. Orchestrator chạy lại các job LOST bằng `start_jobs` với cùng lệnh, worker chờ job cài slot của mình. Như vậy vẫn đúng, chỉ chậm hơn.
- Ước tính mới: READY ở khoảng phút 8–10. Cần đo ở trận tiếp theo.

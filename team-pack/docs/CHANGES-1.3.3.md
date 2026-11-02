# 1.3.3: thời gian làm item (từ trận BCYRV9M9, 29/10/2026)

| Item | Mở → nộp | Lượt model | Lần poll `write_stdin` 1 giây | Lần chạy script chụp màn hình |
|---|---|---|---|---|
| BUG-02 | 10,8′ | 48 | 23 | 1 |
| BUG-01 (kèm sửa baseline) | 19,0′ | 76 | 60 | 14 |
| TASK-02 | 14,0′ | 61 | 52 | 1 |
| CR-01 | >14′ | 53 | 45 | 4 |

Nguyên nhân:
1. Worker luôn chạy lệnh với `yield_time_ms` 1000. Lệnh dài (build, test, dev server, Playwright) nên phải poll
   bằng `write_stdin` hàng chục lần, mỗi lần tốn một lượt model.
2. Mỗi item worker tự viết script Playwright và tự dựng dev server, rồi tự debug lại. BUG-01 chạy script của
   nó 14 lần.
3. Worker gửi báo cáo tiến độ cho orchestrator (3–7 tin mỗi worker), orchestrator hỏi lại (hơn 20 tin):
   cả hai bên tốn thêm lượt và worker bị cắt ngang.

Sửa trong 1.3.3:
- Profile worker và `WORKER.md`: lệnh dài chạy với `yield_time_ms` 120000–300000, không poll 1 giây; dùng
  `.mtm-tmp/tools/serve.mjs` và `shot.mjs`; không nhắn orchestrator, ngoài câu trả lời cuối.
- Profile orchestrator và `SKILL.md`: không bao giờ ping worker hay scout; chờ scout bằng `wait_agent` 300 s.
- `ENVIRONMENT.md` phần E: lúc chuẩn bị, scout viết và kiểm thử `serve.mjs` và `shot.mjs`. `start_work` copy
  thư mục `.mtm-tmp/tools/` vào từng slot.

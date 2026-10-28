# Practice match DO6SQWGV (team MLD) — 28-Oct-2026 19:27 → 20:52

Pack 1.3.1 (orchestrator + 3 worker slot), workspace `D:\mtm\MLD-multi`, Player 0.9.35, `gpt-6.1-sol` effort low,
tài khoản Codex enterprise. Cùng seed Solova với các trận trước. Credential đã được che; đã quét: không còn mật khẩu
DB cục bộ trong thư mục này.

| Thư mục | Nội dung |
|---|---|
| `logs/` | Progress log, poll trạng thái trận của Player, dashboard snapshot, environment report |
| `backlog/` | Brief, submit schema, DONE.json của worker, kết quả Company Tools theo item |
| `answers/` | `submit.json` + evidence đã nộp của 5 item |
| `transcripts/` | 10 session Codex đã che credential (2 session của lần chuẩn bị hỏng + 8 session của lần chạy chính) |
| `code/` | Git bundle, danh sách commit, diff đầy đủ so với seed `d7940bd` |

## Diễn biến
- 19:27 chuẩn bị lần 1: scout tìm mật khẩu DB ở `team-sdlc-pack\.mtm-local` (sai, thư mục thật nằm cạnh
  `team-sdlc-pack`) → ENVIRONMENT BLOCKED, BUILD FAILED. Player resume lại đúng thread cũ nên lần chạy lại 19:41
  vẫn sai. Sửa skill (đường dẫn `<teamSdlcPackWorkspace>/../.mtm-local/`), lần khởi động 19:45 là session mới.
- 19:45–19:52 chuẩn bị lần 2: đủ 5 bước, DB riêng của trận, build pass, 3 slot, baseline 11 pass + `cascade.test.ts`
  fail (bẫy CASCADE quen thuộc).
- 19:52 trận bắt đầu. Wave 1 (BUG-01, BUG-02) phút 0, wave 2 (CR-01, TASK-02) phút 14, wave 3 (TASK-01) phút 29.
- 20:23 nộp xong item cuối; 20:52 trận kết thúc. Lỗi cuối trận `SUBAGENT_REFRESH_UNAVAILABLE` là vòng poll trạng
  thái worker của Player sau khi Codex đã dừng; không ảnh hưởng bài nộp.

## Kết quả phía đội
| Item | Mở (phút) | Nộp (phút) | Mở→nộp | Test | Status | Ghi chú |
|---|---|---|---|---|---|---|
| BUG-01 | 0,6 | 12,7 | 12,1′ | 17/17 | DONE | Worker là baseline owner: thêm migration khôi phục RESTRICT |
| BUG-02 | 0,6 | 14,1 | 13,5′ | 27/27 | DONE | Rebase sau khi BUG-01 vào, chạy lại cả bộ test |
| TASK-02 | 14,1 | 21,6 | 7,5′ | 5/5 | DONE | |
| CR-01 | 14,1 | 21,8 | 7,7′ | 41/41 | DONE | |
| TASK-01 | 29,0 | 31,6 | 2,6′ | 3/3 | PARTIAL | `position` = "98304" (commit đề nhắc tới không có) |

Điểm Grader chưa có trên máy (mọi receipt `ACCEPTED`, score `PENDING`): lấy từ dashboard Game Master.

## Token theo agent (input; cache 92–98%)
| Agent | Item | Input | Output |
|---|---|---|---|
| Orchestrator | cả trận | 4,32M | 11,9k |
| Scout | chuẩn bị | 0,50M | 5,5k |
| Worker | BUG-02 | 2,26M | 9,6k |
| Worker | BUG-01 | 2,00M | 8,8k |
| Worker | CR-01 | 1,04M | 10,0k |
| Worker | TASK-02 | 0,94M | 6,5k |
| Worker | TASK-01 | 0,20M | 2,0k |
| Guardian | 1 lệnh xoá `.next` của BUG-01 (allow) | 0,02M | 0,2k |
| **Tổng lần chạy chính** | | **11,27M** | 54k |
| Lần chuẩn bị hỏng (orchestrator + scout) | | 1,11M | 6,4k |

Orchestrator lúc chờ sau item cuối (28,3′): 8 lượt, 0,62M, mọi lần chờ đều là ô `exec` giữ 270 s, không gọi `wait`.

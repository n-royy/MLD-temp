# Nhật ký cải tiến pack multi-agent (1.3.x) — MLD

Tiếp nối `doc/ITERATIONS.md` (4 vòng của agent-test-0, pack 1.0–1.2). Ba trận dưới đây chạy pack
multi-agent của n-royy (orchestrator + tối đa 3 worker trong git worktree), workspace `D:\mtm\MLD-multi`,
`gpt-6.1-sol` effort low, Player 0.9.35, cùng seed Solova (3 wave, 5 item). Dữ liệu trận vòng C: `doc/practice-DO6SQWGV/`.
Số liệu: session Codex, progress log và dashboard snapshot của Player (mốc giờ từng event), `git log` của trận.

---

## Vòng A → Vòng B: 0J4N522M (1.3.0, 10:04–11:11) → HW828P0Y (1.3.1, 15:50–16:57), 28/10/2026

### 1. Kết quả vòng A (0J4N522M) và nhược điểm

| Chỉ số | Giá trị |
|---|---|
| Item nộp / ACCEPTED | 5/5 (TASK-01 PARTIAL, `position` "98304") |
| Token input toàn đội | 22,6M (orchestrator 14,4M, scout 0,9M, worker 7,3M, guardian 0,02M) |
| Token orchestrator lúc chờ sau item cuối (28,8′) | 7,42M, 101 lượt, 257k/phút |
| So với agent-test-0 vòng 4 (một agent) | 16,6M |

Nhược điểm chính: khi rảnh, orchestrator gọi `wait_for_update` 60 s và `wait` 10 s, mỗi ô `exec` bị trả về sau
~30 s, nên thức ~3,6 lần/phút và mỗi lần gửi lại ~70k ngữ cảnh.

### 2. Thay đổi ở vòng B và kết quả

| # | Thay đổi | Ở đâu |
|---|---|---|
| 1 | `wait_for_update` luôn chặn 240 s khi không worker nào bận (trả về trong ~5 s khi có thay đổi/SLOT_DONE) | helper |
| 2 | Mẫu ô chờ `// @exec: {"yield_time_ms": 270000}` + `wait` 270000 trong skill orchestrator | skill |
| 3 | Kiểm thử trước bằng Codex thật + Game Master giả: 3 wave được Start Work sau 2–8 s | thử nghiệm |

| Chỉ số | Vòng A | Vòng B |
|---|---|---|
| Item nộp / ACCEPTED | 5/5 | 5/5 |
| Điểm Grader | – | 900/1000 (TASK-01 = 0) |
| Token input toàn đội | 22,6M | **13,4M** |
| Orchestrator | 14,4M | 6,8M |
| Chờ sau item cuối: token / lượt / tốc độ | 7,42M / 101 / 257k/phút | **2,24M / 38 / 77k/phút** |
| Nộp xong item cuối | phút 31,1 | phút 30,9 |
| Mở→nộp BUG-02 / BUG-01 / CR-01 / TASK-02 / TASK-01 | 6,0 / 14,2 / 9,1 / 4,8 / 2,1′ | 8,4 / 9,7 / 6,8 / 7,3 / 1,9′ |

### 3. Thảo luận

- **Nhờ quy trình:** helper chặn 240 s cắt 70% token lúc chờ mà không làm chậm trận.
- **Chưa đạt:** agent không chép mẫu ô chờ, tự dùng `exec` nhả sau 1 s và `wait` 60 s, nên vẫn thức 5 lần/4 phút.
  Mẫu chỉ nằm trong skill đọc một lần đầu trận; trong lúc làm item agent quen nhịp ngắn và giữ nguyên.
- **Hồi quy mới:** TASK-01 nộp `position` "0" làm giá trị giữ chỗ vì bài học LESSONS ("dùng PARTIAL thay vì đoán")
  được hiểu là "đừng trả lời". So khớp chuỗi tuyệt đối nên mất 100 điểm; hai lần trước "98304" được trọn điểm.

### 4. Cải thiện tiếp theo (cho vòng C)

| # | Việc | Trạng thái |
|---|---|---|
| 1 | Viết lại bài học TASK-01 + quy tắc "luôn nộp đáp án tốt nhất từ mã nguồn có sẵn, không bao giờ nộp giá trị giữ chỗ" (LESSONS, WORKER) + orchestrator kiểm `answerFile` trước `integrate_item` | áp dụng |
| 2 | Đưa quy tắc chờ vào chỉ dẫn cố định của orchestrator (agent toml) | đề xuất, chưa làm |

---

## Vòng B → Vòng C: HW828P0Y (15:50–16:57) → DO6SQWGV (19:27–20:52), 28/10/2026

### 1. Kết quả vòng B (HW828P0Y) và nhược điểm

900/1000 điểm: 4 item trọn điểm, TASK-01 = 0 vì nộp giá trị giữ chỗ. Token 13,4M; chờ lúc rảnh 77k/phút vì agent
không theo mẫu ô chờ.

### 2. Thay đổi ở vòng C và kết quả

| # | Thay đổi | Ở đâu |
|---|---|---|
| 1 | Quy tắc đáp án giá trị (mục 4.1 vòng B) | LESSONS, WORKER, SKILL |
| 2 | Đường dẫn mật khẩu DB: `<teamSdlcPackWorkspace>/../.mtm-local/` (frame PREPARE không có `teamWorkspace`, scout đã tự suy sai thành `team-sdlc-pack\.mtm-local`) | ENVIRONMENT, solova.md, scout toml |

Sự cố đầu trận: lần chuẩn bị 19:27 bị BLOCKED vì lỗi đường dẫn (mục 2). Sau khi sửa, Player resume đúng thread cũ
nên lần 19:41 vẫn sai (agent giữ kết luận cũ, không đọc lại skill); lần 19:45 là session mới và chuẩn bị đạt.

| Chỉ số | Vòng A | Vòng B | Vòng C |
|---|---|---|---|
| Item nộp / ACCEPTED | 5/5 | 5/5 | 5/5 (4 DONE + TASK-01 PARTIAL) |
| TASK-01 `position` | 98304 | 0 | **98304** |
| Điểm Grader | – | 900 | chờ dashboard |
| Token input toàn đội (lần chạy chính) | 22,6M | 13,4M | **11,3M** (+1,1M lần chuẩn bị hỏng) |
| Orchestrator | 14,4M | 6,8M | **4,3M** |
| Chờ sau item cuối: token / lượt | 7,42M / 101 | 2,24M / 38 | **0,62M / 8** |
| Cách chờ của orchestrator | `wait` 10 s | `exec` 1 s + `wait` 60 s | **`exec` 270 s, không `wait`** |
| Chuẩn bị (lần đạt) | 7,2′ | 7,0′ | 7,2′ |
| Wave 1 xong / item cuối nộp | phút 14,8 / 31,1 | 10,6 / 30,9 | 14,1 / 31,6 |
| Mở→nộp BUG-02 / BUG-01 / CR-01 / TASK-02 / TASK-01 | 6,0 / 14,2 / 9,1 / 4,8 / 2,1′ | 8,4 / 9,7 / 6,8 / 7,3 / 1,9′ | 13,5 / 12,1 / 7,7 / 7,5 / 2,6′ |
| Wave mới → DISCOVERED | – | – | wave 2: ~2 s, wave 3: ~0 s |
| Guardian | 1 lượt | 0 | 1 lượt (xoá cache `.next`, allow) |
| Token worker BUG-02 / BUG-01 / CR-01 / TASK-02 / TASK-01 | 2,77 / 1,29 / 2,09 / 0,84 / 0,29M | 1,69 / 1,63 / 1,18 / 1,03 / 0,32M | 2,26 / 2,00 / 1,04 / 0,94 / 0,20M |

### 3. Thảo luận

- **Nhờ quy trình:**
  - Lần đầu orchestrator theo đúng mẫu ô chờ trọn trận: 8 lượt trong 28 phút rảnh, token chờ giảm 92% so với vòng A.
    Wave mới vẫn được phát hiện trong vài giây, nên chờ dài không làm chậm phản ứng.
  - Quy tắc đáp án giá trị hoạt động: worker vẫn ghi rõ commit đề nhắc tới không có, nhưng nộp "98304" kèm PARTIAL.
  - Sửa đường dẫn `.mtm-local` có hiệu lực ngay khi agent chạy session mới.
- **Nhờ quen đề (không áp dụng được cho đề lạ):** cùng seed lần thứ 7; `solova.md` và LESSONS mô tả sẵn bẫy CASCADE
  và cách sửa, nên worker BUG-01 khôi phục RESTRICT ngay. Thời gian từng item không dùng để dự đoán đề mới.
- **Chưa kiểm chứng được:**
  - Việc theo mẫu ô chờ chưa ổn định: vòng B không theo, vòng C theo, cùng một skill. Một trận chưa đủ kết luận.
  - Wave 1 chậm hơn vòng B 3,5 phút: BUG-02 phải rebase và chạy lại cả bộ test sau khi baseline owner BUG-01 vào.
    Có thể là dao động giữa các lần chạy.
  - Điểm Grader của vòng C chưa có trên máy.
- **Vận hành:** khi lỗi nằm ở skill, Player "chạy lại" có thể resume thread cũ và agent lặp lại kết luận sai. Lần
  thứ ba mới ra session mới; chưa rõ thao tác nào trên Player quyết định điều này.

### 4. Cải thiện tiếp theo

| # | Việc | Trạng thái |
|---|---|---|
| 1 | Đưa quy tắc chờ (mẫu ô 270 s) vào chỉ dẫn cố định của orchestrator để không phụ thuộc lần đọc skill | đề xuất |
| 2 | Ghi vào SETUP: khi chuẩn bị bị chặn do lỗi pack, sửa pack rồi khởi động để Player tạo session mới; xác định thao tác Player nào resume và thao tác nào tạo mới | cần thử |
| 3 | Lấy điểm Grader DO6SQWGV từ dashboard, xác nhận TASK-01 = 100 | chờ đội |
| 4 | Đẩy pack 1.3.1 (kèm 3 sửa đổi) lên MLD-temp; commit pack 1.2.3 vào Megalodon | MLD-temp: đã đẩy; Megalodon: chờ quyết định |
| 5 | Thử một trận trên đề khác seed Solova khi BTC mở, vì mọi số liệu hiện tại đều trên cùng một đề | khi có trận |

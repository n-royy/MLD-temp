# team-sdlc-pack 1.5.15

Nền: 1.5.14. Ghi chú các bản trước nằm trong lịch sử git.

## Vì sao (trận luyện 6YOBNM4Z, pack 1.5.14: 875/1000)
**Phần 1.5.14 làm được:**
- `max_threads = 10` có tác dụng: 6 agent con chạy cùng lúc.
- CR-07 lần đầu được nộp (56, trước đó 0).
- TASK-11 đọc ảnh đúng (80/80).

**Ba quy tắc mới của 1.5.14 lại làm hỏng các item khác:**

| Vấn đề | Quy tắc gây ra |
|---|---|
| **BUG-09 15/80** (trận trước 80). Sửa code đúng nhưng cả 3 dòng trình duyệt NOT_RUN. | Lúc 05:44, TASK-07 (deadline 15 phút, 50 điểm) vừa mở đã bị coi là "at risk" (ngưỡng cố định 15 phút). Orchestrator gửi `WRAP_UP` cho worker BUG-09 khi đang làm evidence; worker còn bị giới hạn 8 phút cho phần trình duyệt. TASK-07 cuối cùng lại chạy ở slot khác. BUG-09 do scout (dùng lại) làm. |
| **PI-02 20 phút, PI-03 18 phút** (trước khoảng 7 phút). | Luật "giao deadline item trước rồi mới tới PI" và "orchestrator chỉ điều phối" khiến orchestrator giao PI-02 cho một worker. Gom dữ liệu PI mất 109 giây vì xếp hàng sau các lần gọi khác. Luật "không gọi trong vòng lặp" làm việc tìm thủ công kéo dài. PI-03 chờ 10 phút vì không có slot (s4 bị worker PI-02 giữ; helper không bao giờ dùng s5 cho PI). |
| **CR-07 56/100.** 3 dòng NOT_RUN vì chưa build xong lúc tới hạn. | Item mức L được giao `team_heavy_worker` (suy luận cao, chậm hơn mỗi bước), kể cả khi là item có deadline. |

## Thay đổi
### 1. PI lại được ưu tiên tuyệt đối
- **Orchestrator tự làm PI ngay**, không bao giờ giao cho worker.
- **Trong cell đầu của wave**, trước PI, chỉ giao các item có deadline và item điều kiện của chúng (start_work + spawn, mất vài giây).
- **Helper:**
  - PI lấy bất kỳ slot nào đang rảnh, kể cả s5;
  - hàng đợi Company Tools cho lần gom dữ liệu PI đi trước các lần gọi khác (vẫn chỉ một lần gọi tại một thời điểm).
- **Gọi Company Tools:** cho phép vài lần gọi `company_tool_call` tường minh trong cùng một cell; vẫn cấm vòng lặp phân trang tự động.
- **Đoán service từ brief:** mỗi cụm chỉ còn 2 tên (`rule-engine`, `rules-engine`) để gom nhanh hơn.

### 2. Không cắt ngang worker đang làm dở
- **Ngưỡng "at risk" theo effort:** item có deadline chỉ bị coi là có nguy cơ khi thời gian còn lại ≤ thời gian cần + 3 phút (S 6, M 10, L 15, XL 20). Một item mức S có deadline 15 phút không còn bị báo ngay lúc mở.
- **`preemptable` chỉ gồm worker đang ở pha GATE**, tức các dòng đã pass và đã commit. Worker ghi pha của mình vào `.mtm-tmp/<ID>/phase.json`: `ROWS` → `EVIDENCE` → `GATE`.
- **Action mới:** `START_NOW_IN_FREE_SLOT`, `WRAP_UP_GATE` hoặc `WAIT_FOR_SLOT`. Không bao giờ cắt worker đang làm dòng hoặc evidence.
- **WORKER.md:** bỏ giới hạn 8 phút cho phần trình duyệt. Thất bại hai lần thì đổi cách tiếp cận, không đổi mục tiêu; mỗi dòng MVS chỉ được NOT_RUN khi đã hết giờ.

### 3. Đúng loại agent cho đúng item
- **`team_heavy_worker`** chỉ dùng cho item heavy (XL). Item mức L và mọi item có deadline dùng `team_feature_worker`.
- **Spawn agent mới cho mỗi item** khi pool còn chỗ (`max_threads = 10` đã có tác dụng).
- **Scout** chỉ được dùng lại khi lần spawn bị từ chối, vì context của nó đầy phần chuẩn bị.

## Kiểm thử
- **`incident.test`:**
  - **at-risk:** CR-47 mức S, còn 8 phút → `needMinutes` 6, có báo. `preemptable` chỉ có TASK-48 (pha GATE); BUG-49 (pha ROWS) không bị đụng tới.
  - **PI:** PI lấy s5 khi s5 là slot rảnh duy nhất.
- Toàn bộ 7 file test pass; check-distribution READY.

# team-sdlc-pack 1.5.14

Nền: 1.5.13 (gồm 1.5.13: heavy dạng code và slot s6). Ghi chú các bản trước nằm trong lịch sử git.

## Vì sao (trận luyện 6QYJQAVJ, pack 1.5.12: 864/1000)
| Item | Điểm | Nguyên nhân |
|---|---|---|
| CR-07 | 0/100 | Không có slot suốt 18 phút. TASK-08 (36 phút) và BUG-09 (29 phút), cả hai không có deadline, giữ 2/3 worker. Orchestrator tự làm hai PI trong 12 phút. Tới 02:41, khi chỉ còn 2 phút, CR-07 mới được giao. |
| TASK-11 | 64/80 | Orchestrator tự làm item đọc ảnh trong 2 phút, ghi cứng `252320227` thay cho `255230227` mà phiếu ghi ("TASK-10 baseline"). Bài TASK-10 của chính đội có đúng 255230227 nhưng không được đối chiếu. |
| TASK-08 | 80/100 | Bước tự kiểm bắt 36/37 bản code bị làm hỏng, có cả case chuyển account (lỗi của trận trước). Nhưng bộ test không chạy trên source gốc, và I0 chỉ dùng tên ASCII. Item nộp PARTIAL vì một test cũ timeout trên Windows. |

**Nguyên nhân gốc: giới hạn số agent.**
- Lúc 02:36, tạo heavy worker cho TASK-10 bị từ chối: `collab spawn failed: agent thread limit reached`, khi đang có 4 agent con (scout ngồi không từ 02:10, cộng 3 worker).
- Vì vậy orchestrator tự làm PI-02, PI-03, TASK-10, TASK-07, TASK-05, TASK-06, TASK-11.

**Các vấn đề khác:**
- **PI-02 mất 7,5 phút:** dữ liệu helper gom sót service `rule-engine`; orchestrator phải gọi `search_logs` trong vòng lặp tới 24 lần, trái luật "never from a script or loop".
- **BUG-09:** mất 20 phút tự viết script Playwright để chụp evidence.

## Thay đổi
### 1. Agent là một pool
- **Cấu hình:** `config/codex.toml` thêm `[agents] max_threads = 10`. Mặc định của Codex là 6 luồng mở, và agent ngồi không vẫn tính.
- **Orchestrator (SKILL.md, file agent):**
  - dùng lại agent đã xong việc bằng `followup_task` trước khi tạo agent mới;
  - lần tạo agent bị từ chối thì không thử lại;
  - slot không gắn cứng với loại agent: slot nào rảnh (s1–s3, s5, s6) cũng nhận được item; `heavy` chỉ quyết định loại agent khi tạo mới.
- **Scout** (`team-repo-scout.toml`): sau khi chuẩn bị xong, khi nhận một item thì làm worker theo WORKER.md. game-preparation ghi chú giữ scout lại để dùng làm worker.

### 2. Item có deadline không bị bỏ đói
- **Helper:** lý do mới `DEADLINE_AT_RISK`, báo một lần cho mỗi item. Điều kiện: item có deadline (của chính nó, hoặc là điều kiện của item có deadline) chưa có slot và còn ≤ 15 phút. Kèm theo:
  - `freeSlots`: mọi slot rảnh trừ s4;
  - `preemptable`: các slot đang giữ item không có deadline;
  - `action`: `START_NOW_IN_FREE_SLOT`, `PREEMPT_NO_DEADLINE_ITEM` hoặc `NO_SLOT`.
- **Orchestrator:**
  - giao item có deadline **trước** khi tự làm PI;
  - khi có `DEADLINE_AT_RISK`: dùng slot rảnh, nếu không có thì gửi `WRAP_UP` cho worker của một item không deadline, rồi giao slot đó cho item có deadline.
- **Worker:**
  - nhận `WRAP_UP` thì trong 2 phút commit bài PARTIAL hợp lệ, ghi DONE.json, rồi dừng;
  - quality gate tối đa `gateBudgetMinutes` = 12 phút và luôn nhường item có deadline.

### 3. Đọc số chính xác và đối chiếu chéo
- **Helper:**
  - brief có `needsVision` khi brief nhắc ảnh/hình/sơ đồ;
  - `start_work` từ chối item đọc ảnh ở s4 (`OWN_SLOT_RESERVED`);
  - mỗi lần nộp, helper ghi các giá trị đáp án vào `.git/mtm/answers-index.json`; brief có `teamAnswersFile` trỏ tới file này.
- **Worker:**
  - số đọc từ ảnh phải đọc hai lần độc lập (cả ảnh, rồi vùng cắt phóng to), so từng chữ số;
  - giá trị mà đề nói lấy từ item khác phải đối chiếu với `teamAnswersFile`.
- **Orchestrator:** chỉ tự làm PI và câu hỏi tra cứu nhỏ; không làm item đọc ảnh, item heavy hay item nhiều bước, trừ khi hết agent và sắp tới hạn.

### 4. Quality gate cho bộ test (SUITE_DETECTION)
- **Chạy trên source gốc:** chạy bộ test trên `issuedRevision`, khôi phục mọi file sản phẩm trong các module của spec, kể cả các bản sửa do item khác đưa lên branch. Mỗi bản sửa phải làm ít nhất một case đỏ.
- **Biến thể không phải ASCII:** luật về chữ (so sánh không phân biệt hoa thường, title case, đọc số tiền) có thêm biến thể tiếng Việt, chữ có dấu và dấu trừ Unicode.
- **Test cũ lỗi do môi trường:** test có sẵn fail hoặc timeout trên máy không phải là lý do để nộp PARTIAL.

### 5. Evidence giao diện có giới hạn thời gian
- Phần trình duyệt của một item: khoảng 8 phút.
- Bắt đầu từ `shot.mjs`; script tự viết chỉ cho các bước công cụ có sẵn không làm được, tối đa 2 lần viết lại.
- Vẫn không được thì giữ các dòng đã chứng minh và báo blocker cụ thể cho phần còn lại.

### 6. PI và Company Tools
- **Đoán service từ brief:** helper suy tên service từ brief ("rule engine" → `rule-engine`, `rules-engine`…) và truy vấn những service chưa có dòng nào, kể cả khi lần quét không lọc trông như đã đủ.
- **Hàng đợi:** mọi lần gọi Company Tools trong helper chạy tuần tự, từng lần một.
- **Cấm vòng lặp:** SKILL.md và WORKER.md cấm gọi Company Tools trong vòng lặp hoặc script.

## Kiểm thử
- **`incident.test`:**
  - **`DEADLINE_AT_RISK`:** CR-47 (còn 14 phút, chưa có slot) được báo với `freeSlots` = s5, s6 và `preemptable` = TASK-48, BUG-49. BUG-41 (điều kiện của CR-47, đang chạy) không bị coi là preemptable. Mỗi item chỉ báo một lần.
  - **Item đọc ảnh:** bị từ chối ở s4; brief có `needsVision`, `gateBudgetMinutes`, `teamAnswersFile`.
  - **Đoán service:** lần quét không lọc báo đủ nhưng thiếu `rule-engine`; brief "The rule engine…" → helper lấy đủ 2 dòng `rule-engine`.
- **`helper.test`:** sau khi nộp, `answers-index.json` chỉ chứa giá trị, không có trường meta.
- Toàn bộ 7 file test pass; check-distribution READY.

## Chưa kiểm chứng
- **`max_threads`:** MTM Player có nhận `[agents] max_threads = 10` từ cấu hình của pack không. Nếu không, pool vẫn hoạt động nhờ dùng lại agent.
- **Scout làm worker:** chạy với chỉ dẫn của scout cộng WORKER.md; cần xem trận thật.

# team-sdlc-pack 1.5.8

Nền: 1.5.7. Ghi chú các bản trước nằm trong lịch sử git.

## Vì sao (trận 9O802QWE: 884/1000)
- **BUG-01 = 0/100.**
  - Phần sửa layout đúng: header/main ở x=240 trên desktop, x=0 trên mobile.
  - Nhưng script layout của BTC chờ trang Accounting "networkidle", mà trang đó tải lại dữ liệu liên tục: một query nhận ngày giờ mới ở mỗi lần render. Script không chạy xong, không có report, nên worker báo FAIL cả 3 dòng ở phút 10.
  - Worker đã chẩn đoán đúng nhưng ghi "unrelated defect, fix separately", vì luật cũ "Never commit another item's fix in your item". Không item nào trong backlog sở hữu lỗi này, nên luật đó không áp dụng.
- **PI-01 về nhì (144/160).** Đáp án đúng 100%; commit 81 giây sau khi PI mở. Phần còn lại là các lượt model làm việc thủ công: điền answer, validate, commit, ghi DONE.json, integrate.

## Thay đổi
### 1. Lỗi chặn kiểm chứng (WORKER.md, SKILL.md)
- Mục mới **"A defect that blocks your verification"**. Khi một lỗi nằm ngoài phần mình sửa nhưng chặn kiểm chứng của chính dòng mình (script BTC, MVS, evidence), worker xét xem ai sở hữu lỗi:
  - **Item khác sở hữu** (mô tả trong `otherItems` của brief, hoặc orchestrator đã báo): không sửa; đi đường vòng hoặc chờ bản sửa lên branch;
  - **Không ai sở hữu**: lỗi thuộc về item của mình. Sửa nhỏ nhất đủ để kiểm chứng chạy được, commit riêng, chạy lại test hiện có, ghi vào engineering record. Không bao giờ sửa script hay report của BTC thay vào đó.
  - Không để dòng nào FAIL hoặc NOT_RUN chỉ vì có lỗi chặn trong khi còn thời gian.
- Luật cũ đổi thành "never commit a fix that another item owns".
- **Orchestrator:** DONE.json hoặc ghi chú answer để dòng FAIL/NOT_RUN với lý do kiểu "blocked by", "separate defect" trong khi còn hơn khoảng 4 phút, và không item nào sở hữu lỗi đó: `followup_task` một lần yêu cầu worker sửa nhỏ nhất rồi chạy lại.
- **Helper:** brief có thêm `otherItems` (key và tiêu đề các item đã mở), để worker phân biệt lỗi có chủ với lỗi không chủ.

### 2. Nộp câu trả lời giá trị trong một lần gọi (PI, TASK)
- Tool mới **`answer_item {backlogItemKey, values, record, evidence, status, integrate}`**:
  - điền template `answers/<ID>/submit.json` (chỉ nhận các khóa có trong template; khóa lạ báo `UNKNOWN_FIELD`);
  - gộp `record` vào object `*Record` của template;
  - ghi evidence (nội dung, hoặc `{from}` là file nằm trong slot), liệt kê vào `evidenceFiles`;
  - đặt status, validate (sai thì trả `INVALID` kèm problems và không commit);
  - commit `answers/<ID>` trong slot, ghi DONE.json;
  - với `integrate: true` (chỉ orchestrator) thì tích hợp và nộp luôn.
- **Incident fast path:** bước 3–4 cũ (điền answer, validate, git add/commit, ghi doneFile, `integrate_item`) thay bằng một lần `answer_item` với `integrate: true`.
- `incident/solve-starter.mjs` (mới): script mẫu đã nạp và đánh chỉ mục `logs.json`, `entities.json`, `kb.md`. Script không quyết định gì; quy tắc KB quyết định.
- **Worker:** câu hỏi giá trị (TASK) và investigation dùng `answer_item` (không integrate). Hai file agent của worker ghi rõ "answer_item only without integrate".

## Kiểm thử
- `tests/incident.test.mjs`: 10 test. Test mới:
  - khóa lạ → `UNKNOWN_FIELD`;
  - giá trị rỗng → `INVALID`;
  - đáp án hợp lệ với `integrate: true` → `SUBMITTED`; answer có status DONE, các trường, `evidenceFiles` và record được gộp đúng;
  - có `solve-starter.mjs`.
- Mock GM trả template và schema kiểu PI cho item PI.
- Toàn bộ 6 file test pass; check-distribution READY (19 tool).

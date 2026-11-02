# team-sdlc-pack 1.6.0: helper tự chạy MVS trước khi nộp

## Vì sao
BTC ghi trong brief: "mỗi test case chỉ được điểm khi bạn báo PASS kèm evidence **và** bản replay `<ID>-mvs.test.ts` qua".
Đến 1.5.5, chỉ worker tự khai kết quả. Nếu một dòng báo PASS mà replay trượt, dòng đó mất điểm và không ai phát hiện
trước khi nộp. Bản này thêm bước kiểm tra bằng code, không bằng luật trong prompt.

## Thay đổi
- `src/mvs.mjs` (mới): `replayMvs` chạy file MVS của BTC ngay trong slot, bằng vitest có sẵn của dự án (gọi thẳng
  `node .../vitest.mjs`, không qua shell).
  - Lần 1: config tối giản (alias `~` → `src`, không global setup) cho các MVS hàm thuần ("Neither uses a database").
    File test được chép vào `.mtm-tmp/<ID>/mvs/`.
  - Lần 2 (chỉ khi lần 1 không nạp được file): dùng config của chính dự án với bản chép tạm
    `tests/mtm-mvs-<id>.test.ts`, chạy xong thì xoá.
  - Mỗi kết quả test được gắn vào dòng test case theo mã `<ID>-TC-nn` trong tên describe hoặc test.
- `integrate_item` chạy bước kiểm tra này **trước khi pull, push hay nộp**:
  - `MVS_FAILING`: một dòng báo PASS mà replay trượt. Kèm danh sách dòng và tên test lỗi. Không có gì được nộp.
  - `MVS_NOT_RUNNABLE`: file MVS không nạp được (thiếu module, sai export) trong khi có dòng báo PASS.
  - Thành công: kết quả có `mvsCheck` gồm trạng thái, lần chạy, số giây, số pass/fail theo dòng, `passingButNotReported`
    (dòng có replay qua nhưng chưa báo PASS) và `claimedPassButFailing`. File `.mtm-tmp/<ID>/mvs-check.json` lưu
    cùng thông tin.
  - `allowMvsFailure: true` vẫn cho nộp (chỉ dùng ở safety net).
  - Item không có file MVS thì bỏ qua (`SKIPPED`).
- Luật: SKILL (bước 6 và safety net), WORKER (bước 3) và file agent orchestrator ghi cách xử lý `MVS_FAILING` /
  `MVS_NOT_RUNNABLE` / `passingButNotReported`.

## Kiểm thử
- `tests/mvs.test.mjs` (mới, dùng vitest thật):
  - code sai, dòng báo PASS → `MVS_FAILING` (có thông báo "expected -1 to be 5"), không có gì được nộp,
    `mvs-check.json` ghi FAILED ở lần 1;
  - sửa code → SUBMITTED, `mvsCheck.status = PASSED`;
  - module chưa tồn tại mà dòng báo PASS → `MVS_NOT_RUNNABLE` (đã thử cả lần 2); `allowMvsFailure` → SUBMITTED,
    bản chép tạm ở lần 2 đã được xoá.
- Chạy thử trên code base Solova thật (vitest 3.2.6 của dự án) với file MVS BUG-04 của BTC: phát hiện đúng 2 lỗi đã
  cài sẵn ("expected 0 to be greater than 0", "expected 393216 to be 262144"); `compareRows` đánh dấu dòng báo PASS là
  `claimedPass`. Worktree không bị thay đổi.
- Các test cũ đều pass. `check-distribution`: READY 1.6.0. Installer có chép `mvs.mjs`.

## Giới hạn
- Chỉ áp dụng cho item có `<ID>-mvs.test.ts` (BUG/CR hàm thuần). Các dòng cần ảnh chụp giao diện hay file CSV tải về
  không có replay tự động.
- Mỗi lần tích hợp item có MVS chậm thêm vài giây (lần 1). Lần 2 có global setup nên có thể mất 10–30 giây.

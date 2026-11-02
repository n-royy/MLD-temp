# team-sdlc-pack 1.6.1: evidence giao diện bằng tool có sẵn, kiểm tra evidence bắt buộc bằng code

## Vì sao (T5QSM1E2)
BUG-02 chỉ 1/4 và CR-01 chỉ 1/5 test case PASS, dù code của cả hai đều đúng:
- BUG-02: script trình duyệt tự viết không bấm được vì sidebar (lỗi của BUG-01) che mất nút.
- CR-01: script đăng nhập không hoàn tất ("hydration"), nên không có ảnh chụp và file CSV tải về.
- Các dòng bị để `NOT_RUN`. CR-01 được nộp khi trận còn khoảng 14 phút.

## Mục 1: `ui-run.mjs` (tool evidence giao diện của pack)
`src/ui-run.mjs` được start_work chép vào `.mtm-tmp/tools/` của mọi slot. Worker chỉ viết các bước bằng JSON:
`goto`, `tab`, `click`, `fill`, `select` (`<select>` thật hoặc combobox/listbox), `check`, `waitFor`, `press`,
`download` (lưu nguyên vẹn đúng tên MVS), `screenshot` (đúng viewport), `neutralize`, `viewport`, `wait`. Có thể thêm
`server` để tự bật dev server.
- **Đăng nhập:** chờ ô mật khẩu xuất hiện, điền lại đến khi giá trị được giữ (React có thể xoá), Enter, rồi chờ URL rời
  khỏi trang login (không chờ "hydration"). Không được thì bấm nút submit. Phiên được lưu và dùng lại.
- **Nút bị che:** tool đọc lỗi Playwright "<…> intercepts pointer events", tắt pointer-events của phần tử che bằng một
  style chỉ trong phiên trình duyệt này, rồi click lại bình thường. Không dùng click `force`, vì click đó sẽ rơi vào phần
  tử che. Báo cáo có `blockedBy` và `neutralized`. Code sản phẩm không bị đụng tới.
- **Chụp ảnh:** chờ network idle và chờ các chỉ báo loading (`aria-busy`, skeleton, progressbar) biến mất.
- **Báo cáo:** một dòng JSON gồm kết quả từng bước, danh sách file (kèm số byte và viewport), và ảnh lỗi khi một bước
  thất bại.
- Dùng Playwright của dự án, nếu không có thì dùng Playwright toàn cục. Không có Chromium thì thử Edge, rồi Chrome.
- **Luật:** bỏ `shot.mjs` và luật "sửa script tối đa 2 lần". Worker sửa spec chứ không sửa tool, và làm tiếp khi còn
  thời gian. Scout ghi cách đăng nhập vào `.mtm-tmp/tools/ui-login.json` (chỉ tài khoản test seed cục bộ).

## Mục 3: helper kiểm tra evidence bắt buộc (`src/evidence.mjs`)
- `requiredEvidence(md)` đọc file MVS của BTC. Hỗ trợ các dạng đã gặp:
  - "Required evidence: `a.png`, `b.txt`";
  - "Required evidence (screenshot): a.png and b.png";
  - danh sách gạch đầu dòng;
  - bảng "General evidence (required once)".

  Chỉ lấy file nằm sau dòng "Required evidence", nên file được nhắc ở phần các bước không bị tính.
- `integrate_item`, sau bước kiểm tra MVS:
  - `REQUIRED_EVIDENCE_MISSING`: dòng PASS không tham chiếu, hoặc trên đĩa không có, file mà MVS bắt buộc.
  - `EARLY_PARTIAL`: còn dòng không PASS (hoặc thiếu file "required once") trong khi deadline của item hoặc hết trận
    còn hơn 4 phút. Kèm danh sách dòng, file còn thiếu và số phút còn lại.
  - `acceptGaps: "<lý do ≥ 20 ký tự>"` vẫn cho nộp. Kết quả có `evidenceCheck`; file `.mtm-tmp/<ID>/evidence-check.json`
    lưu cùng nội dung.
- `validateCommand` của worker in thêm `requiredEvidence` (dòng PASS thiếu file, dòng chưa xong, file "required once"
  còn thiếu), để worker thấy trước khi nộp.

## Kiểm thử
- `tests/ui-run.test.mjs` (Playwright thật, app giả có đúng các lỗi của T5QSM1E2):
  - form đăng nhập chỉ chạy sau 0,9 s;
  - sidebar cố định che tab và nút Export;
  - `<select>` công ty;
  - tải CSV có BOM, dấu ngoặc kép, CRLF.

  Kết quả: đăng nhập được; tab bị che được bấm sau khi vô hiệu sidebar (`blockedBy` có `nav[aria-label="Primary"]`);
  file CSV giống từng byte; ảnh đúng 1440×900; lần chạy thứ hai dùng lại phiên; bước lỗi báo đúng số bước và có ảnh
  lỗi.
- `tests/evidence.test.mjs`:
  - parser chạy đúng với các dạng MVS thật (BUG-02, BUG-01, CR-01);
  - PASS thiếu file → `REQUIRED_EVIDENCE_MISSING`, và validator liệt kê đúng file thiếu;
  - `NOT_RUN` khi còn khoảng 30 phút → `EARLY_PARTIAL` kèm danh sách;
  - `acceptGaps` quá ngắn → `INVALID_ACCEPT_GAPS`; lý do đủ dài → SUBMITTED (`ACCEPTED_GAPS`);
  - đủ evidence → SUBMITTED (`OK`);
  - `ui-run.mjs` có trong slot.
- Các test cũ đều pass. `check-distribution`: READY 1.6.1. Installer có chép `evidence.mjs` và `ui-run.mjs`.

## Chưa kiểm chứng
- `ui-run.mjs` chưa chạy trên app Solova thật và trên Windows. Đây là phần cần đo ở trận tới.
- Nhãn form của Solova (ví dụ "Amount (VND)") phải lấy từ app: worker đọc ảnh lỗi rồi sửa spec.

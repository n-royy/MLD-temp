# Bộ dữ liệu trận MTM của đội MLD

Gom mọi backlog item, dữ liệu Company Tools ("issues") và mã nguồn gốc của các trận đội đã chạy trong
`D:\mtm\MLD` và `D:\mtm\MLD-multi`. Mỗi thứ được lưu đúng một lần theo nội dung (content-addressed).
Không chứa bài giải, transcript hay mật khẩu: chỉ là đề và dữ liệu đề.

## Cấu trúc
| Thư mục | Nội dung | Khoá chống trùng |
|---|---|---|
| `codebases/<tree12>/` | Thư mục trận đúng như BTC phát (commit đầu tiên thêm thư mục trận), chỉ file Git track | Git tree hash của thư mục trận |
| `backlog/<ID>__<hash12>/` | `start.json` (startInstruction, submitTemplate, MVS), `files/` (file BTC phát khi Start Work), `description__*.md` + `meta__*.json` (đề, điểm, deadline) | Hash của startInstruction + template + MVS + file BTC |
| `issues/<ID>/<tool>__<hash12>.txt` | Câu trả lời Company Tools đã gọi cho item (`get_test_data`, `kb_search`, `search_logs`…) | Hash nội dung sau khi thay mã trận bằng `<MATCH_ID>` |
| `index.json` | Trận → codebase, item variant; item → trận dùng nó; issue → trận; `gaps` | |

Một ID có thể có nhiều variant khi BTC sửa đề (ví dụ `BUG-01` của 5APIQYXW chấm bằng script đo layout,
khác `BUG-01` của các trận Solova trước). Variant khác nhau là đề khác nhau, không phải bản trùng.

## Thêm dữ liệu sau mỗi trận
```powershell
node tools\collect-dataset.mjs dataset D:\mtm\MLD D:\mtm\MLD-multi
```
(chạy từ thư mục gốc repo; các tham số sau `dataset` là team workspace có thư mục `matches\`).
Chạy lại chỉ thêm cái mới (đã kiểm: chạy hai lần liên tiếp, số file không đổi). Có thể thêm workspace khác vào cuối lệnh.
`gaps` trong kết quả liệt kê item đã thấy nhưng chưa có đề (chưa Start Work) hoặc thiếu mô tả.

## Phạm vi và giới hạn
- Đề đầy đủ (`descriptionMd`) chỉ được lưu ở pack nhiều agent (`brief.json` trong slot). Các trận một agent
  (QNW5V6OU, VREGZAVG, FWBI6I0S, CTG2YCRL) dùng đúng các variant mà trận nhiều agent đã lưu, nên vẫn đủ mô tả.
- Issues của các trận một agent nằm lẫn trong transcript nên không trích; các variant đó đã có issues từ trận
  nhiều agent cùng đề.
- Item chỉ được BTC phát đề khi đội Start Work: item thấy trên bảng mà không làm thì không có đề (xem `gaps`).

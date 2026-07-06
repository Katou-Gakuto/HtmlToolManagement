/**
 * すべてのJSONデータが保持すべき共通項目を定義します。
 * IDはUUID形式、日時はISO 8601形式を使用します。
 */
export interface BaseData {
  readonly ID: string;
  readonly Version: string;
  readonly CreateDate: string;
  readonly UpdateDate: string;
}
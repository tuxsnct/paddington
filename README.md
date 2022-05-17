# paddington
Please look after this bear. Thank you. 🐻

## 使い方
1. Git, Node.js (v16以降) をインストール
2. `git clone https://github.com/tuxsnct/paddington.git`を実行する
3. `npm install`を実行する
4. `.env`ファイルの以下の項目を設定する
  - `PADDINGTON_URL`, 使用するウェブサイトのURLをコピーして貼り付ける
  - `PADDINGTON_ID`, IDを入力する
  - `PADDINGTON_PASSWORD`, パスワードを入力する
  - （オプション）`PADDINGTON_SLEEP_PER_QUESTION`, 単位はms, 初期値を使うことを推奨
  - （オプション）`PADDINGTON_PROXY_SERVER`, `http://wpad.example.com:8080/`のように設定する
5. `npm start`を実行する

# ライセンス
Apache-2.0

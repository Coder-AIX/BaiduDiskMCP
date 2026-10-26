BaiduDiskMCP 便携版
===================

Linux:
  ./start.sh

macOS:
  双击 start.command

启动后访问 http://localhost:3000/admin（端口以 .env 为准）。

首次访问按页面提示设置管理员密码，然后配置百度网盘 access_token。

端口配置
--------
编辑 .env：
  PORT=3000
  APP_BASE_URL=http://localhost:3000

修改端口后，必须同时修改 APP_BASE_URL（或登录管理端在设置页更新短链地址），
否则上传/下载短链仍会指向旧地址。

数据与备份
----------
- 数据库、临时文件都在 data 目录。
- 备份时先停止服务，再复制整个 data 目录。
- 需要迁移旧配置时，把旧环境的 data/app.db（以及 app.db-wal、app.db-shm）
  复制到本目录的 data 下。

系统要求
--------
- Linux：glibc 系统（Debian/Ubuntu/CentOS 等），不支持 Alpine。
- macOS：仅支持当前包对应的 CPU 架构（arm64 或 x64）。
- 启动脚本和 Node 运行时已包含在包内，目标机器无需安装 Node.js。
- macOS 包未签名，首次打开可能被 Gatekeeper 拦截；右键选择“打开”，
  或执行：xattr -dr com.apple.quarantine <本目录>

许可协议
--------
本项目采用“个人免费使用、禁止商用”的授权方式：

- 允许：个人学习、研究与自用。
- 禁止：任何形式的商业用途。
- 商业授权：如需将本项目用于商业场景，须事先获得作者书面授权。
  可通过 https://github.com/Coder-AIX/BaiduDiskMCP/issues 联系作者。

本仓库不附带独立 LICENSE 文件；以上说明即为本项目的许可声明。

项目主页
--------
https://github.com/Coder-AIX/BaiduDiskMCP

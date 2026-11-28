# SemVer 2.0 与 Keep a Changelog 1.1.0 权威规范

## 1. 语义化版本号 (Semantic Versioning 2.0.0)

版本格式：`MAJOR.MINOR.PATCH[-PRERELEASE][+BUILD]`

1. **MAJOR (主版本号)**：当做了不兼容的 API 修改或破坏性重构时递增；
2. **MINOR (次版本号)**：当以向后兼容的方式添加了新功能时递增；
3. **PATCH (修订号)**：当做了向后兼容的缺陷修复时递增。

---

## 2. Keep a Changelog 6 维标准分类

每一次版本发布，变更条目必须严格归入以下 6 种明确类别之一：

1. **Added (新增)**：新增加的功能或特性；
2. **Changed (变更)**：对现有功能的调整与改变；
3. **Deprecated (弃用)**：此前已支持、即将在未来主版本中移除的功能；
4. **Removed (移除)**：在此版本中被物理删除的旧特性；
5. **Fixed (修复)**：针对历史缺陷与 Bug 的修复；
6. **Security (安全)**：安全漏洞修复或敏感依赖升级。

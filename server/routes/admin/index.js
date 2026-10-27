const express = require("express");
const { requireAuth } = require("../../middleware/auth");
const { limits } = require("../../middleware/security");

const router = express.Router();

// Tudo aqui exige login de administrador/equipe (e CSRF nos metodos que alteram dados).
router.use(requireAuth("admin", "staff"), limits.admin);
router.use("/users", requireAuth("admin"), require("./users"));
router.use("/chat", require("./chat"));
router.use(require("./finance"));
router.use(require("./crm"));
router.use(require("./insights"));

module.exports = router;

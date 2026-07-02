/**
 * Main.controller.js
 * Controller de ejemplo — compatible con UI5 1.108
 *
 * APIs utilizadas (todas en la lista "allowed" de ui5-compatibility.json v1.108):
 *   - sap.ui.core.mvc.Controller
 *   - sap.ui.model.json.JSONModel
 *   - sap.m.MessageToast
 *   - sap.base.Log  (logger moderno, recomendado desde UI5 1.58)
 *
 * Buenas prácticas aplicadas:
 *   - Se usa sap.ui.define en lugar de APIs de módulo heredadas
 *   - Se evita el método getCore() del core global (deprecado desde 1.84)
 *   - Se usa sap.base.Log en lugar del logger heredado
 */
sap.ui.define(
  [
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/base/Log",
  ],
  function (Controller, JSONModel, MessageToast, Log) {
    "use strict";

    // Nombre del logger para este módulo
    const LOGGER = Log.getLogger("com.ejemplo.sapui5.controller.Main");

    return Controller.extend("com.ejemplo.sapui5.controller.Main", {

      // ── Inicialización ──────────────────────────────────────────────────
      onInit: function () {
        LOGGER.info("Inicializando MainController");

        // Modelo de datos de ejemplo
        const oModel = new JSONModel({
          productos: [
            { codigo: "P001", nombre: "Teclado mecánico", precio: 89.99, estado: "Activo" },
            { codigo: "P002", nombre: "Monitor 27\"", precio: 349.00, estado: "Activo" },
            { codigo: "P003", nombre: "Mouse inalámbrico", precio: 45.50, estado: "Inactivo" },
            { codigo: "P004", nombre: "Auriculares USB", precio: 129.00, estado: "Activo" },
          ],
        });

        this.getView().setModel(oModel);
        LOGGER.debug("Modelo de productos cargado con " + oModel.getProperty("/productos").length + " registros");
      },

      // ── Handlers de búsqueda ────────────────────────────────────────────
      onBuscar: function (oEvent) {
        const sQuery = oEvent.getParameter("query");
        this._filtrarTabla(sQuery);
      },

      onBuscarLive: function (oEvent) {
        const sQuery = oEvent.getParameter("newValue");
        this._filtrarTabla(sQuery);
      },

      /**
       * Filtra la tabla de productos por nombre o código.
       * @param {string} sQuery - Texto de búsqueda
       */
      _filtrarTabla: function (sQuery) {
        const oTable = this.byId("tablaProductos");
        const oBinding = oTable.getBinding("items");

        if (!oBinding) {
          LOGGER.warning("No se encontró el binding de la tabla");
          return;
        }

        if (!sQuery) {
          oBinding.filter([]);
          return;
        }

        const sap_ui_model_Filter = sap.ui.require("sap/ui/model/Filter");
        const sap_ui_model_FilterOperator = sap.ui.require("sap/ui/model/FilterOperator");

        if (!sap_ui_model_Filter || !sap_ui_model_FilterOperator) {
          // Lazy load en caso de que no esté precargado
          sap.ui.require(
            ["sap/ui/model/Filter", "sap/ui/model/FilterOperator"],
            function (Filter, FilterOperator) {
              oBinding.filter([
                new Filter({
                  filters: [
                    new Filter("nombre", FilterOperator.Contains, sQuery),
                    new Filter("codigo", FilterOperator.Contains, sQuery),
                  ],
                  and: false,
                }),
              ]);
            }
          );
          return;
        }

        oBinding.filter([
          new sap_ui_model_Filter({
            filters: [
              new sap_ui_model_Filter("nombre", sap_ui_model_FilterOperator.Contains, sQuery),
              new sap_ui_model_Filter("codigo", sap_ui_model_FilterOperator.Contains, sQuery),
            ],
            and: false,
          }),
        ]);
      },

      // ── Handlers de acciones ────────────────────────────────────────────
      onAgregarProducto: function () {
        LOGGER.info("Acción: Agregar producto");
        MessageToast.show("Funcionalidad de agregar producto no implementada en el ejemplo.");
      },

      onRefrescar: function () {
        LOGGER.info("Acción: Refrescar tabla");
        const oModel = this.getView().getModel();
        // En un escenario real, aquí se haría una llamada al backend
        MessageToast.show("Tabla refrescada.");
        oModel.refresh(true);
      },

      onVerDetalle: function (oEvent) {
        const oItem = oEvent.getSource();
        const oCtx = oItem.getBindingContext();
        const oCodigo = oCtx.getProperty("codigo");
        LOGGER.info("Ver detalle del producto: " + oCodigo);
        MessageToast.show("Detalle del producto: " + oCodigo);
      },

      onEditarProducto: function (oEvent) {
        // Evitar que el clic en "Editar" propague al handler de fila (onVerDetalle)
        oEvent.stopPropagation();

        const oButton = oEvent.getSource();
        const oCtx = oButton.getBindingContext();
        const oCodigo = oCtx.getProperty("codigo");
        LOGGER.info("Editar producto: " + oCodigo);
        MessageToast.show("Editando producto: " + oCodigo);
      },

      onExportar: function () {
        LOGGER.info("Acción: Exportar tabla");
        MessageToast.show("Exportación no implementada en el ejemplo.");
      },

      // ── Ciclo de vida ───────────────────────────────────────────────────
      onExit: function () {
        LOGGER.info("MainController destruido");
      },
    });
  }
);

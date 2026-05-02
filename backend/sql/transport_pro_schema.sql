-- =============================================
-- TRANSPORT PRO - Schema completo
-- =============================================

-- Empresas (tenants del sistema)
CREATE TABLE IF NOT EXISTS empresas (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(150) NOT NULL,
  rut         VARCHAR(20) UNIQUE,
  plan        VARCHAR(20) DEFAULT 'trial' CHECK (plan IN ('trial','basico','pro')),
  activo      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Usuarios (todos los roles en una sola tabla)
CREATE TABLE IF NOT EXISTS usuarios (
  id           SERIAL PRIMARY KEY,
  empresa_id   INT REFERENCES empresas(id) ON DELETE CASCADE,
  nombre       VARCHAR(100) NOT NULL,
  email        VARCHAR(150) UNIQUE NOT NULL,
  password     VARCHAR(255) NOT NULL,
  rol          VARCHAR(20) NOT NULL CHECK (rol IN ('superadmin','admin','chofer','cliente')),
  telefono     VARCHAR(20),
  activo       BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Vehiculos
CREATE TABLE IF NOT EXISTS vehiculos (
  id           SERIAL PRIMARY KEY,
  empresa_id   INT REFERENCES empresas(id) ON DELETE CASCADE,
  patente      VARCHAR(10) NOT NULL,
  tipo         VARCHAR(50),         -- camion, furgon, etc.
  capacidad_kg NUMERIC(10,2),
  activo       BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Pedidos (creados por el cliente)
CREATE TABLE IF NOT EXISTS pedidos (
  id                       SERIAL PRIMARY KEY,
  empresa_id               INT REFERENCES empresas(id),
  cliente_id               INT REFERENCES usuarios(id),
  origen                   VARCHAR(255) NOT NULL,
  destino                  VARCHAR(255) NOT NULL,
  tipo_carga               VARCHAR(100),
  observaciones            TEXT,
  metodo_pago              VARCHAR(50),
  fecha_retiro_programada  TIMESTAMPTZ NOT NULL,
  fecha_entrega_programada TIMESTAMPTZ NOT NULL,
  estado  VARCHAR(20) DEFAULT 'pendiente'
            CHECK (estado IN ('pendiente','asignado','en_curso','completado','cancelado')),
  created_at               TIMESTAMPTZ DEFAULT NOW()
);

-- Viajes (asignados por el admin)
CREATE TABLE IF NOT EXISTS viajes (
  id                  SERIAL PRIMARY KEY,
  pedido_id           INT REFERENCES pedidos(id) ON DELETE CASCADE,
  empresa_id          INT REFERENCES empresas(id),
  chofer_id           INT REFERENCES usuarios(id),
  vehiculo_id         INT REFERENCES vehiculos(id),
  fecha_inicio_real   TIMESTAMPTZ,
  fecha_entrega_real  TIMESTAMPTZ,
  estado  VARCHAR(20) DEFAULT 'asignado'
            CHECK (estado IN ('asignado','en_curso','completado')),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Alertas (retrasos, incidentes)
CREATE TABLE IF NOT EXISTS alertas (
  id          SERIAL PRIMARY KEY,
  viaje_id    INT REFERENCES viajes(id) ON DELETE CASCADE,
  empresa_id  INT REFERENCES empresas(id),
  tipo        VARCHAR(50) CHECK (tipo IN ('retraso','incidente','mecanico','otro')),
  descripcion TEXT,
  resuelta    BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Indices para performance
CREATE INDEX IF NOT EXISTS idx_pedidos_empresa    ON pedidos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_estado     ON pedidos(estado);
CREATE INDEX IF NOT EXISTS idx_viajes_chofer      ON viajes(chofer_id);
CREATE INDEX IF NOT EXISTS idx_viajes_pedido      ON viajes(pedido_id);
CREATE INDEX IF NOT EXISTS idx_alertas_viaje      ON alertas(viaje_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_empresa   ON usuarios(empresa_id);

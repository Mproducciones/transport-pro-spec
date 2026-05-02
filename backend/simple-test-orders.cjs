#!/usr/bin/env node

/**
 * Script simple para crear datos de prueba básicos
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function createSimpleTestData() {
  console.log('📦 Creando datos de prueba simples...\n');

  try {
    // Verificar tenant demo
    let tenant = await prisma.tenant.findUnique({ where: { slug: 'demo' } });
    
    if (!tenant) {
      console.log('🏢 Creando tenant demo...');
      tenant = await prisma.tenant.create({
        data: {
          name: 'Transporte Demo Pro',
          slug: 'demo',
        }
      });
      console.log('✅ Tenant creado');
    }

    // Crear usuarios principales si no existen
    console.log('👤 Verificando usuarios principales...');
    
    const adminUser = await prisma.user.findFirst({ where: { email: 'admin@demo.com', role: 'admin' } });
    if (!adminUser) {
      const hashedPassword = await bcrypt.hash('Admin123!', 10);
      await prisma.user.create({
        data: {
          tenantId: tenant.id,
          email: 'admin@demo.com',
          passwordHash: hashedPassword,
          role: 'admin',
        }
      });
      console.log('✅ Admin creado');
    }

    const clienteUser = await prisma.user.findFirst({ where: { email: 'cliente@demo.com', role: 'cliente' } });
    if (!clienteUser) {
      const hashedPassword = await bcrypt.hash('Cliente123!', 10);
      await prisma.user.create({
        data: {
          tenantId: tenant.id,
          email: 'cliente@demo.com',
          passwordHash: hashedPassword,
          role: 'cliente',
        }
      });
      console.log('✅ Cliente creado');
    }

    const conductorUser = await prisma.user.findFirst({ where: { email: 'conductor@demo.com', role: 'conductor' } });
    if (!conductorUser) {
      const hashedPassword = await bcrypt.hash('Conductor123!', 10);
      await prisma.user.create({
        data: {
          tenantId: tenant.id,
          email: 'conductor@demo.com',
          passwordHash: hashedPassword,
          role: 'conductor',
        }
      });
      console.log('✅ Conductor creado');
    }

    console.log('\n🎉 Datos básicos creados exitosamente!\n');
    
    console.log('📋 Accesos disponibles:');
    console.log('🔹 Admin: admin@demo.com / Admin123!');
    console.log('🔹 Cliente: cliente@demo.com / Cliente123!');
    console.log('🔹 Conductor: conductor@demo.com / Conductor123!');
    console.log('\n🌐 URLs:');
    console.log('🔹 Admin: http://localhost:5173/admin');
    console.log('🔹 Cliente: http://localhost:5173/cliente');
    console.log('🔹 Conductor: http://localhost:5173/conductor');

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar el script
if (require.main === module) {
  createSimpleTestData()
    .then(() => {
      console.log('\n✨ Script completado exitosamente');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Falló la ejecución:', error);
      process.exit(1);
    });
}

module.exports = { createSimpleTestData };

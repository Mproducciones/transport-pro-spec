// Verificar configuración de proxy del frontend
const fs = require('fs');
const path = require('path');

function checkFrontendProxy() {
  console.log('🔍 VERIFICANDO CONFIGURACIÓN DE PROXY DEL FRONTEND\n');

  // 1. Verificar vite.config.ts
  const viteConfigPath = path.join(__dirname, 'frontend/vite.config.ts');
  
  if (fs.existsSync(viteConfigPath)) {
    console.log('✅ Encontrado: frontend/vite.config.ts');
    
    try {
      const viteConfig = fs.readFileSync(viteConfigPath, 'utf8');
      
      console.log('📋 Contenido de vite.config.ts:');
      console.log(viteConfig);
      
      // Buscar configuración de proxy
      if (viteConfig.includes('proxy')) {
        console.log('✅ Configuración de proxy encontrada');
        
        if (viteConfig.includes('localhost:4000')) {
          console.log('✅ Proxy apunta a localhost:4000 (correcto)');
        } else {
          console.log('❌ Proxy no apunta a localhost:4000');
        }
        
        if (viteConfig.includes('/api')) {
          console.log('✅ Proxy incluye /api (correcto)');
        } else {
          console.log('❌ Proxy no incluye /api');
        }
      } else {
        console.log('❌ No se encontró configuración de proxy en vite.config.ts');
      }
      
    } catch (error) {
      console.log('❌ Error leyendo vite.config.ts:', error.message);
    }
  } else {
    console.log('❌ No encontrado: frontend/vite.config.ts');
  }

  // 2. Verificar vite.config.js
  const viteConfigJsPath = path.join(__dirname, 'frontend/vite.config.js');
  
  if (fs.existsSync(viteConfigJsPath)) {
    console.log('\n✅ Encontrado: frontend/vite.config.js');
    
    try {
      const viteConfigJs = fs.readFileSync(viteConfigJsPath, 'utf8');
      
      console.log('📋 Contenido de vite.config.js:');
      console.log(viteConfigJs);
      
      if (viteConfigJs.includes('proxy')) {
        console.log('✅ Configuración de proxy encontrada en .js');
      } else {
        console.log('❌ No se encontró configuración de proxy en vite.config.js');
      }
      
    } catch (error) {
      console.log('❌ Error leyendo vite.config.js:', error.message);
    }
  } else {
    console.log('\n❌ No encontrado: frontend/vite.config.js');
  }

  // 3. Verificar package.json del frontend
  const packageJsonPath = path.join(__dirname, 'frontend/package.json');
  
  if (fs.existsSync(packageJsonPath)) {
    console.log('\n✅ Encontrado: frontend/package.json');
    
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      
      console.log('📋 Scripts en package.json:');
      if (packageJson.scripts) {
        Object.keys(packageJson.scripts).forEach(script => {
          console.log(`   ${script}: ${packageJson.scripts[script]}`);
        });
      }
      
      // Verificar dependencias de proxy
      if (packageJson.devDependencies) {
        const hasVite = packageJson.devDependencies.vite || packageJson.dependencies?.vite;
        if (hasVite) {
          console.log(`✅ Vite encontrado: ${hasVite}`);
        }
      }
      
    } catch (error) {
      console.log('❌ Error leyendo package.json:', error.message);
    }
  }

  // 4. Verificar .env del frontend
  const envPath = path.join(__dirname, 'frontend/.env');
  const envLocalPath = path.join(__dirname, 'frontend/.env.local');
  
  [envPath, envLocalPath].forEach((envFile, index) => {
    const fileName = index === 0 ? '.env' : '.env.local';
    
    if (fs.existsSync(envFile)) {
      console.log(`\n✅ Encontrado: frontend/${fileName}`);
      
      try {
        const envContent = fs.readFileSync(envFile, 'utf8');
        
        console.log(`📋 Contenido de ${fileName}:`);
        console.log(envContent);
        
        if (envContent.includes('VITE_API_URL')) {
          console.log('✅ VITE_API_URL encontrado');
        } else {
          console.log('❌ VITE_API_URL no encontrado');
        }
        
      } catch (error) {
        console.log(`❌ Error leyendo ${fileName}:`, error.message);
      }
    } else {
      console.log(`\n❌ No encontrado: frontend/${fileName}`);
    }
  });

  // 5. Verificar client.ts o api configuration
  const clientTsPath = path.join(__dirname, 'frontend/src/client.ts');
  const apiConfigPath = path.join(__dirname, 'frontend/src/api/config.ts');
  
  [clientTsPath, apiConfigPath].forEach((configFile, index) => {
    const fileName = index === 0 ? 'client.ts' : 'api/config.ts';
    
    if (fs.existsSync(configFile)) {
      console.log(`\n✅ Encontrado: frontend/src/${fileName}`);
      
      try {
        const configContent = fs.readFileSync(configFile, 'utf8');
        
        console.log(`📋 Configuración en ${fileName}:`);
        
        // Buscar baseURL o API_URL
        if (configContent.includes('baseURL') || configContent.includes('API_URL')) {
          console.log('✅ Configuración de API encontrada');
          
          // Extraer la URL base
          const baseURLMatch = configContent.match(/baseURL:\s*['"`]([^'"`]+)['"`]/);
          const apiUrlMatch = configContent.match(/API_URL\s*=\s*['"`]([^'"`]+)['"`]/);
          
          if (baseURLMatch) {
            console.log(`   baseURL: ${baseURLMatch[1]}`);
          }
          
          if (apiUrlMatch) {
            console.log(`   API_URL: ${apiUrlMatch[1]}`);
          }
          
          if (configContent.includes('localhost:5174')) {
            console.log('❌ ERROR: API apunta a localhost:5174 (incorrecto)');
          } else if (configContent.includes('localhost:4000')) {
            console.log('✅ API apunta a localhost:4000 (correcto)');
          } else {
            console.log('⚠️ API usa URL relativa (debería funcionar con proxy)');
          }
        } else {
          console.log('❌ No se encontró configuración de API');
        }
        
      } catch (error) {
        console.log(`❌ Error leyendo ${fileName}:`, error.message);
      }
    } else {
      console.log(`\n❌ No encontrado: frontend/src/${fileName}`);
    }
  });

  console.log('\n🔧 DIAGNÓSTICO DEL PROBLEMA:');
  console.log('❌ El frontend está llamando a: http://localhost:5174/api/v1/auth/login');
  console.log('✅ Debería llamar a: http://localhost:4000/api/v1/auth/login');
  console.log('❌ O usar proxy: /api/v1/auth/login → http://localhost:4000/api/v1/auth/login');
  
  console.log('\n🎯 SOLUCIONES POSIBLES:');
  console.log('1. Configurar proxy en vite.config.ts');
  console.log('2. Cambiar baseURL en client.ts a http://localhost:4000');
  console.log('3. Usar URL relativa y configurar proxy correctamente');
  
  console.log('\n📝 RECOMENDACIÓN:');
  console.log('Verificar y corregir la configuración de proxy en vite.config.ts');
  console.log('Asegurar que las llamadas API usen URL relativa (/api/...)');
  console.log('Reiniciar el servidor de desarrollo del frontend después de los cambios');
}

checkFrontendProxy();

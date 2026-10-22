import type { Metadata } from "next";
import Link from "next/link";
import { CONTACTO_LEGAL, FECHA_TERMINOS } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Términos y condiciones · Diablongo",
  description: "Las reglas de Diablongo: es un juego, la IA no da consejos y tú respondes por tus decisiones.",
};

// Texto legal en lenguaje claro. Cualquier cambio de fondo actualiza FECHA_TERMINOS (lib/legal.ts).
export default function Terminos() {
  return (
    <main className="legal">
      <Link href="/" className="legal-volver">
        ← Volver al juego
      </Link>

      <h1 className="legal-titulo">Términos y condiciones</h1>
      <p className="legal-fecha">Última actualización: {FECHA_TERMINOS}</p>

      <div className="legal-resumen">
        <p>
          <strong>En corto:</strong> Diablongo es un juego de entretenimiento. Lo que dicen el Ángel y el Diablo lo
          escribe una inteligencia artificial, puede estar mal y <strong>no es un consejo</strong>. Lo que decidas
          hacer después es decisión tuya y responsabilidad tuya.
        </p>
      </div>

      <section>
        <h2>1. Qué es Diablongo</h2>
        <p>
          Diablongo (diablongo.vercel.app) es un juego en el que escribes un dilema y dos personajes de ficción, un
          Ángel y un Diablo, discuten sobre él con frases cortas generadas por modelos de inteligencia artificial de
          terceros. Al final eliges a quién le haces caso y el juego te muestra un desenlace inventado.
        </p>
        <p>
          Al usar Diablongo aceptas estos términos. Si no estás de acuerdo con ellos, no lo uses. Debes ser mayor de
          edad o usarlo con autorización y acompañamiento de tus padres o de quien te tenga a cargo.
        </p>
      </section>

      <section>
        <h2>2. No es un consejo profesional</h2>
        <p>
          Los personajes no son personas, ni expertos, ni asesores. Nada de lo que aparece en el juego, incluidos los
          desenlaces y las tarjetas para compartir, es asesoría médica, psicológica, legal, financiera, tributaria,
          de seguridad ni de ningún otro tipo. No lo uses como base para decisiones sobre tu salud, tu dinero, tu
          trabajo, tus relaciones, tu seguridad o la de otras personas. Para eso consulta a un profesional.
        </p>
        <p>
          El Diablo es un personaje que tienta y exagera a propósito: está hecho para divertir, no para que le hagas
          caso. Que un personaje gane la discusión o que la barra se incline hacia un lado no significa que esa sea la
          opción correcta.
        </p>
      </section>

      <section>
        <h2>3. Tus decisiones son tuyas</h2>
        <p>
          Tú eres la única persona que decide qué hacer con tu dilema, antes y después de jugar. Al usar Diablongo
          reconoces y aceptas que:
        </p>
        <ul>
          <li>
            Cualquier decisión, acción u omisión que tomes, tenga o no relación con lo que viste en el juego, es
            exclusivamente tuya y la asumes bajo tu propio riesgo.
          </li>
          <li>
            Diablongo y quienes lo operan no responden por los resultados de esas decisiones, ni por pérdidas de
            dinero, daños materiales, lesiones, problemas de salud, conflictos personales, laborales o legales, ni
            por ningún otro perjuicio, directo o indirecto, que se derive de ellas.
          </li>
          <li>
            Tampoco respondemos por lo que hagan otras personas con las tarjetas o el contenido que tú compartas.
          </li>
        </ul>
        <p>
          Estas limitaciones se aplican en la máxima medida que permite la ley colombiana y no excluyen la
          responsabilidad que, por ley, no se puede excluir (por ejemplo, la que surge de dolo o culpa grave), ni
          los derechos irrenunciables que te da el Estatuto del Consumidor (Ley 1480 de 2011).
        </p>
      </section>

      <section>
        <h2>4. El contenido lo genera una IA</h2>
        <p>
          Las frases del juego las producen modelos de inteligencia artificial de terceros. Aunque los instruimos
          para que sean breves, respetuosas y seguras, y revisamos las frases del Diablo antes de mostrarlas, la IA
          puede equivocarse, inventar datos, contradecirse o producir algo inapropiado. No garantizamos que el
          contenido sea exacto, completo, adecuado ni útil para ningún propósito.
        </p>
        <p>
          Si escribes sobre un tema que pone en riesgo tu vida o la de otra persona, el juego no se juega: te
          mostramos líneas de ayuda. <strong>Diablongo no es un servicio de emergencias ni de apoyo emocional.</strong>{" "}
          Si estás en peligro, llama al 123 en Colombia o al número de emergencias de tu país. Para hablar con
          alguien sobre tu salud mental en Colombia, marca 192, opción 4.
        </p>
      </section>

      <section>
        <h2>5. Uso permitido</h2>
        <p>Puedes jugar todo lo que quieras dentro de los límites del modo que uses. No está permitido:</p>
        <ul>
          <li>Intentar que los personajes den instrucciones para hacerte daño o hacer daño a otros.</li>
          <li>Usar el juego para acosar, amenazar, difamar o exponer datos de otras personas.</li>
          <li>
            Saltarse los límites del modo gratis, la comprobación de Cloudflare o cualquier medida de seguridad, o
            automatizar el uso con bots o scripts.
          </li>
          <li>Intentar acceder a partes del servicio, cuentas o datos que no son tuyos.</li>
        </ul>
        <p>Si detectamos estos usos podemos bloquear el acceso sin aviso previo.</p>
      </section>

      <section>
        <h2>6. Modos de juego y servicios de terceros</h2>
        <p>
          En el modo gratis, el servidor paga los modelos y hay un límite de debates por día. En los modos «Conectar
          OpenRouter» y «Mi key» usas tu propia cuenta o key de un proveedor de IA: los costos que te cobre ese
          proveedor son tuyos, y tu key se guarda solo en tu navegador. Esos proveedores (por ejemplo OpenRouter,
          Google o Groq) tienen sus propios términos y políticas, que también aceptas al usarlos.
        </p>
        <p>
          Podemos cambiar los modelos, los límites o los modos, o suspender el servicio, en cualquier momento. No
          garantizamos que el juego esté siempre disponible o libre de errores.
        </p>
      </section>

      <section>
        <h2>7. Créditos y pagos</h2>
        <p>
          Los créditos se compran con Mercado Pago, que procesa el pago; nosotros no vemos ni guardamos los datos de
          tu tarjeta. Cada debate en el modo «Con créditos» descuenta lo que se indica antes de empezar y, si los
          modelos fallan antes de terminar, el crédito se devuelve automáticamente. Los créditos solo sirven dentro
          de Diablongo, no son dinero y no se pueden transferir. El precio de cada paquete es el que ves al
          comprarlo.
        </p>
        <p>
          Si tienes un problema con una compra, escríbenos (sección 11). Esto no limita los derechos de retracto,
          garantía y reclamo que te reconoce el Estatuto del Consumidor.
        </p>
      </section>

      <section>
        <h2>8. Tus datos</h2>
        <p>Tratamos lo mínimo para que el juego funcione (Ley 1581 de 2012):</p>
        <ul>
          <li>
            <strong>Tu dilema y las frases del debate</strong> se envían a los proveedores de IA para generar las
            respuestas. No los guardamos en nuestro servidor. No escribas datos personales tuyos ni de otras personas.
          </li>
          <li>
            <strong>Tu dirección IP</strong> se guarda cifrada (como un código que no se puede revertir) durante 48
            horas para contar los debates gratis del día.
          </li>
          <li>
            <strong>Si creas una cuenta</strong>, guardamos tu correo, tu saldo de créditos y tus movimientos de
            compra y uso, con Supabase.
          </li>
          <li>
            <strong>En tu navegador</strong> quedan tu último dilema, tus ajustes, tu marcador y, si lo eliges, tu
            API key. Puedes borrarlos limpiando los datos del sitio.
          </li>
          <li>
            Usamos Cloudflare Turnstile para comprobar que eres una persona y Vercel para alojar el sitio; cada uno
            trata datos técnicos según sus políticas.
          </li>
        </ul>
        <p>
          Puedes pedir que corrijamos o borremos tu cuenta y tus datos escribiéndonos (sección 11). No vendemos tus
          datos.
        </p>
      </section>

      <section>
        <h2>9. Propiedad intelectual</h2>
        <p>
          El nombre Diablongo, el logo, los personajes y los sprites son nuestros. Puedes compartir las tarjetas de
          tus partidas libremente en redes. Lo que escribes en tu dilema sigue siendo tuyo.
        </p>
      </section>

      <section>
        <h2>10. Cambios a estos términos</h2>
        <p>
          Podemos actualizar estos términos. Cuando lo hagamos, cambiará la fecha de arriba. Si sigues usando
          Diablongo después de un cambio, aceptas la nueva versión.
        </p>
      </section>

      <section>
        <h2>11. Contacto y ley aplicable</h2>
        <p>
          Para dudas, reclamos o solicitudes sobre tus datos, escríbenos en{" "}
          <a href={CONTACTO_LEGAL.url} rel="noopener noreferrer" target="_blank">
            {CONTACTO_LEGAL.texto}
          </a>
          . Estos términos se rigen por las leyes de la República de Colombia.
        </p>
      </section>

      <Link href="/" className="legal-volver">
        ← Volver al juego
      </Link>
    </main>
  );
}

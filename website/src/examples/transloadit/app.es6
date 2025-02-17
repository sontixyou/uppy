import Uppy from '@uppy/core'
import Dashboard from '@uppy/dashboard'
import Webcam from '@uppy/webcam'
import Transloadit from '@uppy/transloadit'
import Instagram from '@uppy/instagram'
import Facebook from '@uppy/facebook'
import Zoom from '@uppy/zoom'
import COMPANION from '../env.js'

const enc = new TextEncoder('utf-8')
async  function sha1 (secret, body) {
  const algorithm = { name: 'HMAC', hash: 'SHA-1' }

  const key = await crypto.subtle.importKey('raw', enc.encode(secret), algorithm, false, ['sign', 'verify'])
  const signature = await crypto.subtle.sign(algorithm.name, key, enc.encode(body))
  return Array.from(new Uint8Array(signature), x => x.toString(16).padStart(2, '0')).join('')
}

function initUppy (opts = {}) {
  if (window.uppy) {
    window.uppy.close()
  }

  const zoomMode = document.location.hash === '#enable-zoom'
  const allowedFileTypes = zoomMode ? ['video/*'] : ['image/*']
  const uppy = new Uppy({
    debug: true,
    autoProceed: false,
    restrictions: {
      maxFileSize: 1024 * 1024 * 1024,
      maxNumberOfFiles: 2,
      minNumberOfFiles: 1,
      allowedFileTypes,
    },
    locale: {
      strings: {
        youCanOnlyUploadFileTypes: 'You can only upload images',
      },
    },
  })

  function getExpiration (future) {
    return new Date(Date.now() + future)
      .toISOString()
      .replace('T', ' ')
      .replace(/\.\d+Z$/, '+00:00')
  }

  async function getAssemblyOptions () {
    const hasSecret = opts.secret != null
    let params = {
      auth: {
        key: window.TRANSLOADIT_API_KEY,
        expires: hasSecret ? getExpiration(5 * 60 * 1000) : undefined,
      },
      // It's more secure to use a template_id and enable
      // Signature Authentication
      steps: {
        resize: {
          robot: '/image/resize',
          width: 250,
          height: 250,
          resize_strategy: 'fit',
          text: [
            {
              text: `© ${(new Date()).getFullYear()} Transloadit.com`,
              size: 12,
              font: 'Ubuntu',
              color: '#eeeeee',
              valign: 'bottom',
              align: 'right',
              x_offset: 16,
              y_offset: -10,
            },
          ],
        },
      },
    }

    if (zoomMode) {
      params.steps = {
        resized: {
          use: ':original',
          robot: '/video/encode',
          result: true,
          ffmpeg_stack: 'v3.3.3',
          preset: 'ipad-high',
          resize_strategy: 'fillcrop',
        },
        watermarked: {
          use: 'resized',
          robot: '/video/encode',
          result: true,
          ffmpeg_stack: 'v3.3.3',
          preset: 'ipad-high',
          watermark_opacity: 0.7,
          watermark_position: 'top-right',
          watermark_size: '25%',
          watermark_url: 'https://demos.transloadit.com/inputs/transloadit-padded.png',
          watermark_x_offset: -10,
          watermark_y_offset: 10,
        },
      }
    }

    let signature
    if (opts.secret) {
      params = JSON.stringify(params)
      signature = await sha1(opts.secret, params)
    }

    return { params, signature }
  }

  uppy
    .use(Transloadit, {
      getAssemblyOptions,
      waitForEncoding: true,
    })
    .use(Dashboard, {
      inline: true,
      maxHeight: 400,
      target: '#uppy-dashboard-container',
      note: 'Images only, 1–2 files, up to 1 MB',
    })
    .use(Instagram, {
      target: Dashboard,
      companionUrl: 'https://api2.transloadit.com/companion',
      companionAllowedHosts: Transloadit.COMPANION_PATTERN,
    })
    .use(Facebook, {
      target: Dashboard,
      companionUrl: COMPANION,
    })
    .use(Webcam, { target: Dashboard, modes: ['picture'] })

  if (zoomMode) {
    uppy.use(Zoom, {
      target: Dashboard,
      companionUrl: 'https://api2.transloadit.com/companion',
      companionAllowedHosts: Transloadit.COMPANION_PATTERN,
    })
  }

  uppy
    .on('transloadit:result', (stepName, result) => {
      const file = uppy.getFile(result.localId)
      const resultContainer = document.createElement('div')
      if (!zoomMode) {
        resultContainer.innerHTML = `
          <div>
            <h3>Name: ${file.name}</h3>
            <img src="${result.ssl_url}" /> <br />
            <a href="${result.ssl_url}" target="_blank">View</a>
          </div>
        `
      }

      if (zoomMode && stepName === 'watermarked') {
        resultContainer.innerHTML = `
          <div>
            <h3>Name: ${file.name}</h3>
            <video controls>
              <source src="${result.ssl_url}">
            </video>
             <br />
            <a href="${result.ssl_url}" target="_blank">View</a>
          </div>
        `
      }
      document
        .getElementById('uppy-transloadit-result')
        .appendChild(resultContainer)
    })
}

window.initUppy = initUppy

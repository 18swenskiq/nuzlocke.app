export default function createErrorHandlerModal(event) {
  const errorReason = event?.reason || event?.error || event
  console.error('[Unhandled Error]', errorReason)

  const mContainer = document.createElement('div')
  const mModal = document.createElement('div')

  const cImage = document.createElement('img')
  const cHeading = document.createElement('h2')
  const cCopy = document.createElement('p')
  const cDetails = document.createElement('details')
  const cSummary = document.createElement('summary')
  const cPre = document.createElement('pre')
  const cConfirm = document.createElement('button')

  cHeading.innerHTML = "Oh no! Something's gone wrong"
  cImage.src = '/sprite/202.png'
  cImage.width = 92
  cImage.height = 92
  cCopy.innerHTML =
    'An unexpected error has occured, to prevent any data loss for your run you should <b>Reload the page</b> immediately.<br /><br /> Would you like to reload now?'

  const errMsg = errorReason?.message || errorReason?.toString?.() || 'Unknown error'
  const errStack = errorReason?.stack || ''
  cSummary.textContent = 'Error Details'
  cSummary.style.cssText = 'cursor:pointer;font-size:0.85em;margin-top:0.5em;color:#888;'
  cPre.textContent = errStack ? `${errMsg}\n\n${errStack}` : errMsg
  cPre.style.cssText = 'white-space:pre-wrap;word-break:break-word;font-size:0.75em;max-height:200px;overflow:auto;background:#f5f5f5;padding:8px;border-radius:4px;margin-top:4px;text-align:left;'
  cDetails.appendChild(cSummary)
  cDetails.appendChild(cPre)

  cConfirm.innerText = 'Reload app'
  cConfirm.addEventListener('click', function () {
    window.location = window.location.pathname + '?force-pass=' + +new Date()
  })

  mModal.appendChild(cImage)
  mModal.appendChild(cHeading)
  mModal.appendChild(cCopy)
  mModal.appendChild(cDetails)
  mModal.appendChild(cConfirm)
  mModal.classList.add('error-modal')

  mContainer.appendChild(mModal)
  mContainer.classList.add('error-modal-container')

  document.body.appendChild(mContainer)
}

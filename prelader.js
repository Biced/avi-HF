


    let progress = document.getElementById('progress');
    let gallery = document.getElementById('gallery');

    var queue = new createjs.LoadQueue(false);

    queue.on("fileload", handleFileComplete);
    queue.on('progress', event => {
        let progress = Math.floor(event.progress * 100);
        this.progress.style =`clip-path: circle(${progress}%)`;
        if (progress == 100) {
            console.log('all done');
            // document.querySelector('body').style.background = 'transparent'
        }
    })
    queue.on('complete', event => {
        setTimeout(() => {
            gallery.classList.add('expand');

            progress.classList.add('expand');
        },3000)

    })
    queue.loadFile('models/fbx/phone (2).fbx');
    queue.loadFile('tween.js');
    queue.loadFile('physijs/ammo.js');
    queue.loadFile('physijs/physijs_worker.js');

    function handleFileComplete(event) {

     var item = event.item; // A reference to the item that was passed in to the LoadQueue
     var type = item.type;

     // Add any images to the page body.
     if (type == createjs.Types.IMAGE) {
        gallery.appendChild(event.result);

     }

    }

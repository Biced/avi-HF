




let progress = document.getElementById('progress');
let gallery = document.getElementById('gallery');
let loadingmanager
var queue = new createjs.LoadQueue(false);


queue.on('progress', event => {

	let prog = Math.floor(event.progress * 80);

	progress.style =`clip-path: circle(${prog}%)`;

    if (prog == 80) {
        document.querySelector('body').style.background = 'black'
    }
})
queue.on('fileload', handleFileLoad, this)
function handleFileLoad(event){
	if(event.item.id == "video"){

		event.result.autoplay = true;
		event.result.playsinline = true;
		event.result.muted = true;
		event.result.loop = true;
		event.result.id = "video";
		event.result.hidden = true;

    }
    if(event.item.id == "module" || event.item.id == "module1" || event.item.id == "main"){
        event.result.type = "module"
        event.result.defer = true;
    }
	document.body.appendChild(event.result);

}
// let TEST8, reversegravity;
queue.on('complete', event => {

    gallery.remove();

    progress.classList.add('expand');




    setTimeout(() => {
        progress.remove();

},1000)

})

// queue.loadFile('main.css');
// queue.loadFile('main.js');
queue.loadFile({id:"video" , src:'models/main-page-first-fold.mp4'});
// queue.loadFile('models/fbx/phone (2).fbx');
queue.loadFile('tween.js');
queue.loadFile('./TweenMax.min.js');

// queue.loadFile("https://cdnjs.cloudflare.com/ajax/libs/gsap/2.0.1/TweenMax.min.js");
// queue.loadFile({id:"module" , src:'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js'});
// queue.loadFile({id:"module1" , src:'https://cdn.jsdelivr.net/npm/three@0.118.1/examples/jsm/loaders/FBXLoader.js'});
// queue.loadFile({id:"main" , src:'./main.js'});

// queue.loadFile('physijs/ammo.js');
// queue.loadFile('physijs/physijs_worker.js');

// queue.
// ;